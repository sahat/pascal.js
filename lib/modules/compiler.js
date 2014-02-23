var PascalError = require('./../pascal_error');
var OPCODES = require('./../opcodes');
var Bytecode = require('./bytecode');
var Node = require('./../node');

var Compiler = function() {
  this.exitInstructions = [];

  this.compile = function(root) {
    var bytecode = new Bytecode(root.symbolTable.native);
    this._generateBytecode(bytecode, root, null);
    bytecode.setStartAddress();
    bytecode.add(OPCODES.MST, 0, 0, 'start of program -----------------');
    bytecode.add(OPCODES.CUP, 0, root.symbol.address, "call main program");
    bytecode.add(OPCODES.STP, 0, 0, 'program end');
    return bytecode;
  };

  this._generateBytecode = function(bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var name = node.token.tokenValue;
        var symbolLookup = node.symbolLookup;
        if (symbolLookup.symbol.byReference) {
          bytecode.add(OPCODES.LVA, symbolLookup.level,
            symbolLookup.symbol.address, "address of " + name);
          bytecode.add(OPCODES.LDI, symbolLookup.symbol.type.typeCode,
            0, "value of " + name);
        } else {
          if (symbolLookup.symbol.type.nodeType === Node.SIMPLE_TYPE) {
            var opcode;
            switch (symbolLookup.symbol.type.typeCode) {
              case OPCODES.A:
                opcode = OPCODES.LVA;
                break;
              case OPCODES.B:
                opcode = OPCODES.LVB;
                break;
              case OPCODES.C:
                opcode = OPCODES.LVC;
                break;
              case OPCODES.I:
                opcode = OPCODES.LVI;
                break;
              case OPCODES.R:
                opcode = OPCODES.LVR;
                break;
              default:
                throw new PascalError(node.token, "can't make code to get " +
                  symbolLookup.symbol.type.print());
            }
            bytecode.add(opcode, symbolLookup.level,
              symbolLookup.symbol.address, "value of " + name);
          } else {
            var size = symbolLookup.symbol.type.getTypeSize();
            for (var i = 0; i < size; i++) {
              bytecode.add(OPCODES.LVI, symbolLookup.level,
                symbolLookup.symbol.address + i,
                "value of " + name + " at index " + i);
            }
          }
        }
        break;
      case Node.TK_NUMBER:
        var v = node.getNumber();
        var cindex = bytecode.addConstant(v);
        var typeCode;
        if ((v | 0) === v) {
          typeCode = OPCODES.I;
        } else {
          typeCode = OPCODES.R;
        }
        bytecode.add(OPCODES.LDC, typeCode, cindex, "constant value " + v);
        break;
      case Node.TK_STRING:
        var v = node.token.tokenValue;
        var cindex = bytecode.addConstant(v);
        bytecode.add(OPCODES.LDC, OPCODES.S, cindex, "string '" + v + "'");
        break;
      case Node.BOOLEAN:
        var v = node.token.tokenValue;
        bytecode.add(OPCODES.LDC, OPCODES.B, node.getBoolean() ? 1 : 0, "boolean " + v);
        break;
      case Node.POINTER:
        var cindex = bytecode.addConstant(0);
        bytecode.add(OPCODES.LDC, OPCODES.A, cindex, "nil pointer");
        break;
      case Node.PROGRAM:
      case Node.PROCEDURE:
      case Node.FUNCTION:
        var isFunction = node.nodeType === Node.FUNCTION;
        var name = node.name.token.tokenValue;
        this._beginExitFrame();
        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.PROCEDURE ||
            declaration.nodeType === Node.FUNCTION) {
            this._generateBytecode(bytecode, declaration, node.symbolTable);
          }
        }
        node.symbol.address = bytecode.getNextAddress();
        var frameSize = OPCODES.MARK_SIZE + node.symbolTable.totalVariableSize +
          node.symbolTable.totalParameterSize;
        bytecode.add(OPCODES.ENT, 0, frameSize, "start of " + name + " -----------------");

        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.TYPED_CONST) {
            this._generateBytecode(bytecode, declaration, node.symbolTable);
          }
        }
        this._generateBytecode(bytecode, node.block, node.symbolTable);
        var ujpAddresses = this._endExitFrame();
        var rtnAddress = bytecode.getNextAddress();
        bytecode.add(OPCODES.RTN, isFunction ? node.expressionType.
          returnType.getSimpleTypeCode() : OPCODES.P, 0, "end of " + name);
        for (var i = 0; i < ujpAddresses.length; i++) {
          bytecode.setOperand2(ujpAddresses[i], rtnAddress);
        }
        break;
      case Node.USES:
      case Node.VAR:
      case Node.PARAMETER:
      case Node.CONST:
      case Node.ARRAY_TYPE:
      case Node.TYPE:
        break;
      case Node.BLOCK:
        for (var i = 0; i < node.statements.length; i++) {
          this._generateBytecode(bytecode, node.statements[i], symbolTable);
        }
        break;
      case Node.CAST:
        this._generateBytecode(bytecode, node.expression, symbolTable);
        var fromType = node.expression.expressionType;
        var toType = node.type;
        if (fromType.isSimpleType(OPCODES.I) && toType.isSimpleType(OPCODES.R)) {
          bytecode.add(OPCODES.FLT, 0, 0, "cast to float");
        } else {
          throw new PascalError(node.token, "don't know how to compile a cast from " +
            fromType.print() + " to " + toType.print());
        }
        break;
      case Node.ASSIGNMENT:
        this._generateAddressBytecode(bytecode, node.lhs, symbolTable);
        this._generateBytecode(bytecode, node.rhs, symbolTable);
        var storeTypeCode = node.rhs.expressionType.getSimpleTypeCode();
        bytecode.add(OPCODES.STI, storeTypeCode, 0, "store into " + node.lhs.print());
        break;
      case Node.PROCEDURE_CALL:
      case Node.FUNCTION_CALL:
        var isFunction = node.nodeType === Node.FUNCTION_CALL;
        var declType = isFunction ? "function" : "procedure";
        var symbolLookup = node.name.symbolLookup;
        var symbol = symbolLookup.symbol;

        if (!symbol.isNative) {
          bytecode.add(OPCODES.MST, symbolLookup.level, 0, "set up mark for " + declType);
        }

        for (var i = 0; i < node.argumentList.length; i++) {
          var argument = node.argumentList[i];
          if (argument.byReference) {
            this._generateAddressBytecode(bytecode, argument, symbolTable);
          } else {
            this._generateBytecode(bytecode, argument, symbolTable);
          }
        }

        if (symbol.isNative) {
          var index = symbol.address;
          bytecode.add(OPCODES.CSP, node.argumentList.length, index,
            "call system " + declType + " " + symbol.name);
        } else {
          var parameterSize = symbol.type.getTotalParameterSize();
          bytecode.add(OPCODES.CUP, parameterSize, symbol.address,
            "call " + node.name.print());
        }
        break;
      case Node.REPEAT:
        var topOfLoop = bytecode.getNextAddress();
        bytecode.addComment(topOfLoop, "top of repeat loop");
        this._generateBytecode(bytecode, node.block, symbolTable);
        this._generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(OPCODES.FJP, 0, topOfLoop, "jump to top of repeat");
        break;
      case Node.FOR:
        var varNode = node.variable;
        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, node.fromExpr, symbolTable);
        bytecode.add(OPCODES.STI, 0, 0, "store into " + varNode.print());

        var topOfLoop = bytecode.getNextAddress();
        this._generateBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, node.toExpr, symbolTable);
        bytecode.add(node.downto ? OPCODES.LES : OPCODES.GRT,
          OPCODES.I, 0, "see if we're done with the loop");
        var jumpInstruction = bytecode.getNextAddress();
        bytecode.add(OPCODES.TJP, 0, 0, "yes, jump to end");

        this._generateBytecode(bytecode, node.body, symbolTable);

        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, varNode, symbolTable);
        if (node.downto) {
          bytecode.add(OPCODES.DEC, OPCODES.I, 0, "decrement loop variable");
        } else {
          bytecode.add(OPCODES.INC, OPCODES.I, 0, "increment loop variable");
        }
        bytecode.add(OPCODES.STI, 0, 0, "store into " + varNode.print());
        bytecode.add(OPCODES.UJP, 0, topOfLoop, "jump to top of loop");
        var endOfLoop = bytecode.getNextAddress();
        bytecode.setOperand2(jumpInstruction, endOfLoop);
        break;
      case Node.IF:
        var hasElse = node.elseStatement !== null;
        this._generateBytecode(bytecode, node.expression, symbolTable);
        var skipThenInstruction = bytecode.getNextAddress();
        bytecode.add(OPCODES.FJP, 0, 0, "false, jump " + (hasElse ? "to else" : "past body"));
        this._generateBytecode(bytecode, node.thenStatement, symbolTable);
        var skipElseInstruction = -1;
        if (hasElse) {
          skipElseInstruction = bytecode.getNextAddress();
          bytecode.add(OPCODES.UJP, 0, 0, "jump past else");
        }
        var falseAddress = bytecode.getNextAddress();
        if (hasElse) {
          this._generateBytecode(bytecode, node.elseStatement, symbolTable);
        }
        bytecode.setOperand2(skipThenInstruction, falseAddress);
        if (hasElse !== -1) {
          var endOfIf = bytecode.getNextAddress();
          bytecode.setOperand2(skipElseInstruction, endOfIf);
        }
        break;
      case Node.EXIT:
        var address = bytecode.getNextAddress();
        bytecode.add(OPCODES.UJP, 0, 0, "return from function/procedure");
        this._addExitInstruction(address);
        break;
      case Node.WHILE:
        var topOfLoop = bytecode.getNextAddress();
        bytecode.addComment(topOfLoop, "top of while loop");
        this._generateBytecode(bytecode, node.expression, symbolTable);

        var jumpInstruction = bytecode.getNextAddress();
        bytecode.add(OPCODES.FJP, 0, 0, "if false, exit while loop");

        this._generateBytecode(bytecode, node.statement, symbolTable);
        bytecode.add(OPCODES.UJP, 0, topOfLoop, "jump to top of while loop");

        var endOfLoop = bytecode.getNextAddress();
        bytecode.setOperand2(jumpInstruction, endOfLoop);
        break;
      case Node.TYPED_CONST:
        var constAddress = bytecode.addTypedConstants(node.rawData.data);

        for (var i = 0; i < node.rawData.length; i++) {
          var typeCode = node.rawData.simpleTypeCodes[i];

          bytecode.add(OPCODES.LDA, 0, node.symbol.address + i,
            "address of " + node.name.print() +
              " on stack (element " + i + ")");
          var cindex = bytecode.addConstant(constAddress + i);
          bytecode.add(OPCODES.LDC, OPCODES.A, cindex, "address of " +
            node.name.print() + " in const area (element " + i + ")");
          bytecode.add(OPCODES.LDI, typeCode, 0, "value of element");
          bytecode.add(OPCODES.STI, typeCode, 0, "write value");
        }
        break;
      case Node.NOT:
        this._generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(OPCODES.NOT, 0, 0, "logical not");
        break;
      case Node.NEGATIVE:
        this._generateBytecode(bytecode, node.expression, symbolTable);
        if (node.expression.expressionType.isSimpleType(OPCODES.R)) {
          bytecode.add(OPCODES.NGR, 0, 0, "real sign inversion");
        } else {
          bytecode.add(OPCODES.NGI, 0, 0, "integer sign inversion");
        }
        break;
      case Node.ADDITION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "add", OPCODES.ADI, OPCODES.ADR);
        break;
      case Node.SUBTRACTION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "subtract", OPCODES.SBI, OPCODES.SBR);
        break;
      case Node.MULTIPLICATION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "multiply", OPCODES.MPI, OPCODES.MPR);
        break;
      case Node.DIVISION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "divide", null, OPCODES.DVR);
        break;
      case Node.FIELD_DESIGNATOR:
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(OPCODES.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value of record field");
        break;
      case Node.ARRAY:
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(OPCODES.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value of array element");
        break;
      case Node.ADDRESS_OF:
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        break;
      case Node.DEREFERENCE:
        this._generateBytecode(bytecode, node.variable, symbolTable);
        bytecode.add(OPCODES.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value pointed to by pointer");
        break;
      case Node.EQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "equals", OPCODES.EQU);
        break;
      case Node.INEQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "not equals", OPCODES.NEQ);
        break;
      case Node.LESS_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "less than", OPCODES.LES);
        break;
      case Node.GREATER_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "greater than", OPCODES.GRT);
        break;
      case Node.LESS_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "less than or equal to", OPCODES.LEQ);
        break;
      case Node.GREATER_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "greater than or equal to", OPCODES.GEQ);
        break;
      case Node.AND:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "and", OPCODES.AND);
        break;
      case Node.OR:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "or", OPCODES.IOR);
        break;
      case Node.INTEGER_DIVISION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "divide", OPCODES.DVI, null);
        break;
      case Node.MOD:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "mod", OPCODES.MOD, null);
        break;
      default:
        throw new PascalError(null, "can't compile unknown node " + node.nodeType);
    }
  };

  this._generateNumericBinaryBytecode = function (bytecode, node,
                                                  symbolTable, opName, integerOpcode, realOpcode) {

    this._generateBytecode(bytecode, node.lhs, symbolTable);
    this._generateBytecode(bytecode, node.rhs, symbolTable);
    if (node.expressionType.nodeType === Node.SIMPLE_TYPE) {
      switch (node.expressionType.typeCode) {
        case OPCODES.I:
          if (integerOpcode === null) {
            throw new PascalError(node.token, "can't " + opName + " integers");
          }
          bytecode.add(integerOpcode, 0, 0, opName + " integers");
          break;
        case OPCODES.R:
          if (realOpcode === null) {
            throw new PascalError(node.token, "can't " + opName + " reals");
          }
          bytecode.add(realOpcode, 0, 0, opName + " reals");
          break;
        default:
          throw new PascalError(node.token, "can't " + opName + " operands of type " +
            OPCODES.typeCodeToName(node.expressionType.typeCode));
      }
    } else {
      throw new PascalError(node.token, "can't " + opName +
        " operands of type " + node.expressionType.print());
    }
  };

  this._generateComparisonBinaryBytecode = function (bytecode, node, symbolTable, opName, opcode) {
    this._generateBytecode(bytecode, node.lhs, symbolTable);
    this._generateBytecode(bytecode, node.rhs, symbolTable);
    var opType = node.lhs.expressionType;
    if (opType.nodeType === Node.SIMPLE_TYPE) {
      bytecode.add(opcode, opType.typeCode, 0, opName);
    } else {
      throw new PascalError(node.token, "can't do " + opName +
        " operands of type " + opType.print());
    }
  };

  this._generateAddressBytecode = function(bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var symbolLookup = node.symbolLookup;
        var i;
        if (symbolLookup.symbol.byReference) {
          i = OPCODES.LVA;
        } else {
          i = OPCODES.LDA;
        }
        bytecode.add(i, symbolLookup.level,
          symbolLookup.symbol.address, "address of " + node.print());
        break;

      case Node.ARRAY:
        var arrayType = node.variable.expressionType;
        var strides = [];
        strides.push(arrayType.elementType.getTypeSize());
        for (var i = 0; i < node.indices.length; i++) {
          this._generateBytecode(bytecode, node.indices[i], symbolTable);
          var low = arrayType.ranges[i].getRangeLowBound();
          var cindex = bytecode.addConstant(low);
          bytecode.add(OPCODES.LDC, OPCODES.I, cindex, "lower bound " + low);
          bytecode.add(OPCODES.SBI, 0, 0, "subtract lower bound");
          var size = arrayType.ranges[i].getRangeSize();
          strides.push(strides[strides.length - 1]*size);
        }
        strides.pop();
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        for (var i = 0; i < node.indices.length; i++) {
          var stride = strides.pop();
          bytecode.add(OPCODES.IXA, 0, stride,
            "address of array " +
              ((i === node.indices.length - 1) ? "element" : "slice") +
              " (size " + stride + ")");
        }
        break;

      case Node.FIELD_DESIGNATOR:
        var recordType = node.variable.expressionType;
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        var cindex = bytecode.addConstant(node.field.offset);
        bytecode.add(OPCODES.LDC, OPCODES.I, cindex,
          "offset of field \"" + node.field.name.print() + "\"");
        bytecode.add(OPCODES.ADI, 0, 0, "add offset to record address");
        break;

      case Node.DEREFERENCE:
        this._generateBytecode(bytecode, node.variable, symbolTable);
        break;

      default:
        throw new PascalError(null, "unknown LHS node " + node.print());
    }
  };

  this._beginExitFrame = function () {
    this.exitInstructions.push([]);
  };

  this._addExitInstruction = function (address) {
    this.exitInstructions[this.exitInstructions.length - 1].push(address);
  };

  this._endExitFrame = function () {
    return this.exitInstructions.pop();
  };
};

module.exports = Compiler;