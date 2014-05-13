var opcodes = require('./opcodes');
var Bytecode = require('./bytecode');
var Node = require('./node');

var Compiler = function() {
  this.exitInstructions = [];

  this.compile = function(root) {
    var bytecode = new Bytecode(root.symbolTable.native);
    this.generateBytecode(bytecode, root, null);
    bytecode.setStartAddress();
    bytecode.add(opcodes.MST, 0, 0);
    bytecode.add(opcodes.CUP, 0, root.symbol.address);
    bytecode.add(opcodes.STP, 0, 0);
    return bytecode;
  };

  this.generateBytecode = function(bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var symbolLookup = node.symbolLookup;
        if (symbolLookup.symbol.byReference) {
          bytecode.add(opcodes.LVA, symbolLookup.level, symbolLookup.symbol.address);
          bytecode.add(opcodes.LDI, symbolLookup.symbol.type.typeCode, 0);
        } else {
          if (symbolLookup.symbol.type.nodeType === Node.SIMPLE_TYPE) {
            var opcode;
            switch (symbolLookup.symbol.type.typeCode) {
              case opcodes.A:
                opcode = opcodes.LVA;
                break;
              case opcodes.B:
                opcode = opcodes.LVB;
                break;
              case opcodes.C:
                opcode = opcodes.LVC;
                break;
              case opcodes.I:
                opcode = opcodes.LVI;
                break;
            }
            bytecode.add(opcode, symbolLookup.level, symbolLookup.symbol.address);
          } else {
            var size = symbolLookup.symbol.type.getTypeSize();
            for (var i = 0; i < size; i++) {
              bytecode.add(opcodes.LVI, symbolLookup.level, symbolLookup.symbol.address + i);
            }
          }
        }
        break;
      case Node.TK_NUMBER:
        index = bytecode.addConstant(node.getNumber());
        bytecode.add(opcodes.LDC, opcodes.I, index);
        break;
      case Node.TK_STRING:
        index = bytecode.addConstant(node.token.tokenValue);
        bytecode.add(opcodes.LDC, opcodes.S, index);
        break;
      case Node.BOOLEAN:
        bytecode.add(opcodes.LDC, opcodes.B, node.getBoolean() ? 1 : 0);
        break;
      case Node.POINTER:
        index = bytecode.addConstant(0);
        bytecode.add(opcodes.LDC, opcodes.A, index);
        break;
      case Node.PROGRAM:
        this._beginExitFrame();
        node.symbol.address = bytecode.getNextAddress();
        var frameSize = opcodes.MARK_SIZE + node.symbolTable.totalVariableSize +
          node.symbolTable.totalParameterSize;
        bytecode.add(opcodes.ENT, 0, frameSize);

        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.TYPED_CONST) {
            this.generateBytecode(bytecode, declaration, node.symbolTable);
          }
        }
        this.generateBytecode(bytecode, node.block, node.symbolTable);
        var ujpAddresses = this._endExitFrame();
        var returnAddress = bytecode.getNextAddress();
        bytecode.add(opcodes.RTN, opcodes.P, 0);
        for (var j = 0; j < ujpAddresses.length; j++) {
          bytecode.setOperand2(ujpAddresses[j], returnAddress);
        }
        break;
      case Node.BLOCK:
        for (var i = 0; i < node.statements.length; i++) {
          this.generateBytecode(bytecode, node.statements[i], symbolTable);
        }
        break;
      case Node.ASSIGNMENT:
        this._generateAddressBytecode(bytecode, node.lhs, symbolTable);
        this.generateBytecode(bytecode, node.rhs, symbolTable);
        var storeTypeCode = node.rhs.expressionType.getSimpleTypeCode();
        bytecode.add(opcodes.STI, storeTypeCode, 0);
        break;
      case Node.PROCEDURE_CALL:
        var symbolLookup = node.name.symbolLookup;
        var symbol = symbolLookup.symbol;

        if (!symbol.isNative) {
          bytecode.add(opcodes.MST, symbolLookup.level, 0);
        }

        for (var i = 0; i < node.argumentList.length; i++) {
          var argument = node.argumentList[i];
          if (argument.byReference) {
            this._generateAddressBytecode(bytecode, argument, symbolTable);
          } else {
            this.generateBytecode(bytecode, argument, symbolTable);
          }
        }

        if (symbol.isNative) {
          var index = symbol.address;
          bytecode.add(opcodes.CSP, node.argumentList.length, index);
        } else {
          var parameterSize = symbol.type.getTotalParameterSize();
          bytecode.add(opcodes.CUP, parameterSize, symbol.address);
        }
        break;
      case Node.FOR:
        var varNode = node.variable;
        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this.generateBytecode(bytecode, node.fromExpr, symbolTable);
        bytecode.add(opcodes.STI, 0, 0);

        var topOfLoop = bytecode.getNextAddress();
        this.generateBytecode(bytecode, varNode, symbolTable);
        this.generateBytecode(bytecode, node.toExpr, symbolTable);
        bytecode.add(node.downto ? opcodes.LT : opcodes.GT, opcodes.I, 0);
        var jumpInstruction = bytecode.getNextAddress();
        bytecode.add(opcodes.TJP, 0, 0);

        this.generateBytecode(bytecode, node.body, symbolTable);

        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this.generateBytecode(bytecode, varNode, symbolTable);
        if (node.downto) {
          bytecode.add(opcodes.DEC, opcodes.I, 0);
        } else {
          bytecode.add(opcodes.INC, opcodes.I, 0);
        }
        bytecode.add(opcodes.STI, 0, 0);
        bytecode.add(opcodes.UJP, 0, topOfLoop);
        var endOfLoop = bytecode.getNextAddress();
        bytecode.setOperand2(jumpInstruction, endOfLoop);
        break;
      case Node.IF:
        var hasElse = node.elseStatement !== null;
        this.generateBytecode(bytecode, node.expression, symbolTable);
        var skipThenInstruction = bytecode.getNextAddress();
        bytecode.add(opcodes.FJP, 0, 0);
        this.generateBytecode(bytecode, node.thenStatement, symbolTable);
        var skipElseInstruction = -1;
        if (hasElse) {
          skipElseInstruction = bytecode.getNextAddress();
          bytecode.add(opcodes.UJP, 0, 0);
        }
        var falseAddress = bytecode.getNextAddress();
        if (hasElse) {
          this.generateBytecode(bytecode, node.elseStatement, symbolTable);
        }
        bytecode.setOperand2(skipThenInstruction, falseAddress);
        if (hasElse !== -1) {
          var endOfIf = bytecode.getNextAddress();
          bytecode.setOperand2(skipElseInstruction, endOfIf);
        }
        break;
      case Node.NOT:
        this.generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(opcodes.NOT, 0, 0);
        break;
      case Node.NEGATIVE:
        this.generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(opcodes.NEG, 0, 0);
        break;
      case Node.ADDITION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable, opcodes.ADD);
        break;
      case Node.SUBTRACTION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable, opcodes.SUB);
        break;
      case Node.MULTIPLICATION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable, opcodes.MUL);
        break;
      case Node.INTEGER_DIVISION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable, opcodes.DIV);
        break;
      case Node.MOD:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable, opcodes.MOD);
        break;
      case Node.FIELD_DESIGNATOR:
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(opcodes.LDI, node.expressionType.getSimpleTypeCode(), 0);
        break;
      case Node.ARRAY:
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(opcodes.LDI, node.expressionType.getSimpleTypeCode(), 0);
        break;
      case Node.ADDRESS_OF:
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        break;
      case Node.DEREFERENCE:
        this.generateBytecode(bytecode, node.variable, symbolTable);
        bytecode.add(opcodes.LDI, node.expressionType.getSimpleTypeCode(), 0);
        break;
      case Node.EQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.EQ);
        break;
      case Node.INEQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.NEQ);
        break;
      case Node.LESS_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.LT);
        break;
      case Node.GREATER_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.GT);
        break;
      case Node.LESS_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.LTE);
        break;
      case Node.GREATER_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.GTE);
        break;
      case Node.AND:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.AND);
        break;
      case Node.OR:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable, opcodes.OR);
        break;
    }
  };

  this._generateNumericBinaryBytecode = function(bytecode, node, symbolTable, integerOpcode) {
    this.generateBytecode(bytecode, node.lhs, symbolTable);
    this.generateBytecode(bytecode, node.rhs, symbolTable);
    if (node.expressionType.nodeType === Node.SIMPLE_TYPE) {
      bytecode.add(integerOpcode, 0, 0);
    }
  };

  this._generateComparisonBinaryBytecode = function(bytecode, node, symbolTable, opcode) {
    this.generateBytecode(bytecode, node.lhs, symbolTable);
    this.generateBytecode(bytecode, node.rhs, symbolTable);
    var opType = node.lhs.expressionType;
    if (opType.nodeType === Node.SIMPLE_TYPE) {
      bytecode.add(opcode, opType.typeCode, 0);
    }
  };

  this._generateAddressBytecode = function(bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var symbolLookup = node.symbolLookup;
        var i;
        if (symbolLookup.symbol.byReference) {
          i = opcodes.LVA;
        } else {
          i = opcodes.LDA;
        }
        bytecode.add(i, symbolLookup.level, symbolLookup.symbol.address);
        break;

      case Node.ARRAY:
        var arrayType = node.variable.expressionType;
        var strides = [];
        strides.push(arrayType.elementType.getTypeSize());
        for (var i = 0; i < node.indices.length; i++) {
          this.generateBytecode(bytecode, node.indices[i], symbolTable);
          var low = arrayType.ranges[i].getRangeLowBound();
          var index = bytecode.addConstant(low);
          bytecode.add(opcodes.LDC, opcodes.I, index);
          bytecode.add(opcodes.SUB, 0, 0);
          var size = arrayType.ranges[i].getRangeSize();
          strides.push(strides[strides.length - 1] * size);
        }
        strides.pop();
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        for (var i = 0; i < node.indices.length; i++) {
          var stride = strides.pop();
          bytecode.add(opcodes.IXA, 0, stride);
        }
        break;
    }
  };

  this._beginExitFrame = function() {
    this.exitInstructions.push([]);
  };

  this._endExitFrame = function() {
    return this.exitInstructions.pop();
  };
};

module.exports = Compiler;