var opcodes = require('./opcodes');
var Node = require('./node');

var Compiler = function() {
  this.istore = [];
  this.constants = [];
  this.typedConstants = [];
  this.startAddress = 0;
  this.native = null;

  this.exitInstructions = [];

  this.compile = function(root) {
    this.native = root.symbolTable.native;
    this.generateBytecode(root, null);
    this.setStartAddress();
    this.add(opcodes.MST, 0, 0);
    this.add(opcodes.CUP, 0, root.symbol.address);
    this.add(opcodes.STP, 0, 0);
    return {
      istore: this.istore,
      constants: this.constants,
      typedConstants: this.typedConstants,
      startAddress: this.startAddress,
      native: this.native
    };
  };

  this.generateBytecode = function(node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var symbolLookup = node.symbolLookup;
        if (symbolLookup.symbol.byReference) {
          this.add(opcodes.LVA, symbolLookup.level, symbolLookup.symbol.address);
          this.add(opcodes.LDI, symbolLookup.symbol.type.typeCode, 0);
        } else {
          if (symbolLookup.symbol.type.nodeType === Node.SIMPLE_TYPE) {
            var opcode;
            switch (symbolLookup.symbol.type.typeCode) {
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
            this.add(opcode, symbolLookup.level, symbolLookup.symbol.address);
          } else {
            var size = symbolLookup.symbol.type.getTypeSize();
            for (var i = 0; i < size; i++) {
              this.add(opcodes.LVI, symbolLookup.level, symbolLookup.symbol.address + i);
            }
          }
        }
        break;
      case Node.NUMBER:
        index = this.addConstant(node.getNumber());
        this.add(opcodes.LDC, opcodes.I, index);
        break;
      case Node.STRING:
        index = this.addConstant(node.token.tokenValue);
        this.add(opcodes.LDC, opcodes.S, index);
        break;
      case Node.BOOLEAN:
        this.add(opcodes.LDC, opcodes.B, node.getBoolean() ? 1 : 0);
        break;
      case Node.POINTER:
        index = this.addConstant(0);
        this.add(opcodes.LDC, opcodes.A, index);
        break;
      case Node.PROGRAM:
        this.beginExitFrame();
        node.symbol.address = this.getNextAddress();
        var frameSize = opcodes.MARK_SIZE + node.symbolTable.totalVariableSize +
          node.symbolTable.totalParameterSize;
        this.add(opcodes.ENT, 0, frameSize);

        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.TYPED_CONST) {
            this.generateBytecode(declaration, node.symbolTable);
          }
        }
        this.generateBytecode(node.block, node.symbolTable);
        var ujpAddresses = this.endExitFrame();
        var returnAddress = this.getNextAddress();
        this.add(opcodes.RTN, opcodes.P, 0);
        for (var j = 0; j < ujpAddresses.length; j++) {
          this.setOp2(ujpAddresses[j], returnAddress);
        }
        break;
      case Node.BLOCK:
        for (var i = 0; i < node.statements.length; i++) {
          this.generateBytecode(node.statements[i], symbolTable);
        }
        break;
      case Node.ASSIGNMENT:
        this.generateAddressBytecode(node.lhs, symbolTable);
        this.generateBytecode(node.rhs, symbolTable);
        this.add(opcodes.STI, node.rhs.expressionType.typeCode, 0);
        break;
      case Node.PROCEDURE_CALL:
        var symbolLookup = node.name.symbolLookup;
        var symbol = symbolLookup.symbol;

        if (!symbol.isNative) {
          this.add(opcodes.MST, symbolLookup.level, 0);
        }

        for (var i = 0; i < node.argumentList.length; i++) {
          var argument = node.argumentList[i];
          if (argument.byReference) {
            this.generateAddressBytecode(argument, symbolTable);
          } else {
            this.generateBytecode(argument, symbolTable);
          }
        }
        this.add(opcodes.CSP, node.argumentList.length, symbol.address);
        break;
      case Node.FOR:
        var varNode = node.variable;
        this.generateAddressBytecode(varNode, symbolTable);
        this.generateBytecode(node.fromExpr, symbolTable);
        this.add(opcodes.STI, 0, 0);

        var topOfLoop = this.getNextAddress();
        this.generateBytecode(varNode, symbolTable);
        this.generateBytecode(node.toExpr, symbolTable);
        this.add(node.downto ? opcodes.LT : opcodes.GT, opcodes.I, 0);
        var jumpInstruction = this.getNextAddress();
        this.add(opcodes.TJP, 0, 0);

        this.generateBytecode(node.body, symbolTable);

        this.generateAddressBytecode(varNode, symbolTable);
        this.generateBytecode(varNode, symbolTable);
        if (node.downto) {
          this.add(opcodes.DEC, opcodes.I, 0);
        } else {
          this.add(opcodes.INC, opcodes.I, 0);
        }
        this.add(opcodes.STI, 0, 0);
        this.add(opcodes.UJP, 0, topOfLoop);
        var endOfLoop = this.getNextAddress();
        this.setOp2(jumpInstruction, endOfLoop);
        break;
      case Node.IF:
        var hasElse = node.elseStatement !== null;
        this.generateBytecode(node.expression, symbolTable);
        var skipThenInstruction = this.getNextAddress();
        this.add(opcodes.FJP, 0, 0);
        this.generateBytecode(node.thenStatement, symbolTable);
        var skipElseInstruction = -1;
        if (hasElse) {
          skipElseInstruction = this.getNextAddress();
          this.add(opcodes.UJP, 0, 0);
        }
        var falseAddress = this.getNextAddress();
        if (hasElse) {
          this.generateBytecode(node.elseStatement, symbolTable);
        }
        this.setOp2(skipThenInstruction, falseAddress);
        if (hasElse !== -1) {
          var endOfIf = this.getNextAddress();
          this.setOp2(skipElseInstruction, endOfIf);
        }
        break;
      case Node.NOT:
        this.generateBytecode(node.expression, symbolTable);
        this.add(opcodes.NOT, 0, 0);
        break;
      case Node.NEGATIVE:
        this.generateBytecode(node.expression, symbolTable);
        this.add(opcodes.NEG, 0, 0);
        break;
      case Node.ADDITION:
        this.generateNumericBytecode(node, symbolTable, opcodes.ADD);
        break;
      case Node.SUBTRACTION:
        this.generateNumericBytecode(node, symbolTable, opcodes.SUB);
        break;
      case Node.MULTIPLICATION:
        this.generateNumericBytecode(node, symbolTable, opcodes.MUL);
        break;
      case Node.INTEGER_DIVISION:
        this.generateNumericBytecode(node, symbolTable, opcodes.DIV);
        break;
      case Node.MOD:
        this.generateNumericBytecode(node, symbolTable, opcodes.MOD);
        break;
      case Node.EQUALITY:
        this.generateComparisonBytecode(node, symbolTable, opcodes.EQ);
        break;
      case Node.INEQUALITY:
        this.generateComparisonBytecode(node, symbolTable, opcodes.NEQ);
        break;
      case Node.LESS_THAN:
        this.generateComparisonBytecode(node, symbolTable, opcodes.LT);
        break;
      case Node.GREATER_THAN:
        this.generateComparisonBytecode(node, symbolTable, opcodes.GT);
        break;
      case Node.LESS_OR_EQUAL_TO:
        this.generateComparisonBytecode(node, symbolTable, opcodes.LTE);
        break;
      case Node.GREATER_OR_EQUAL_TO:
        this.generateComparisonBytecode(node, symbolTable, opcodes.GTE);
        break;
      case Node.AND:
        this.generateComparisonBytecode(node, symbolTable, opcodes.AND);
        break;
      case Node.OR:
        this.generateComparisonBytecode(node, symbolTable, opcodes.OR);
        break;
    }
  };

  this.generateNumericBytecode = function(node, symbolTable, integerOpcode) {
    this.generateBytecode(node.lhs, symbolTable);
    this.generateBytecode(node.rhs, symbolTable);
    if (node.expressionType.nodeType === Node.SIMPLE_TYPE) {
      this.add(integerOpcode, 0, 0);
    }
  };

  this.generateComparisonBytecode = function(node, symbolTable, opcode) {
    this.generateBytecode(node.lhs, symbolTable);
    this.generateBytecode(node.rhs, symbolTable);
    var opType = node.lhs.expressionType;
    if (opType.nodeType === Node.SIMPLE_TYPE) {
      this.add(opcode, opType.typeCode, 0);
    }
  };

  this.generateAddressBytecode = function(node, symbolTable) {
    var symbolLookup = node.symbolLookup;
    var i = opcodes.LDA;
    this.add(i, symbolLookup.level, symbolLookup.symbol.address);
  };

  this.beginExitFrame = function() {
    this.exitInstructions.push([]);
  };

  this.endExitFrame = function() {
    return this.exitInstructions.pop();
  };

  this.addConstant = function(constant) {
    for (var i = 0; i < this.constants.length; i++) {
      if (constant === this.constants[i]) {
        return i;
      }
    }
    this.constants.push(constant);
    return this.constants.length - 1;
  };

  this.add = function(opcode, operand1, operand2, comment) {
    var i = opcodes.make(opcode, operand1, operand2);
    this.istore.push(i);
  };

  this.setOp2 = function(address, operand2) {
    var i = this.istore[address];
    i = opcodes.make(opcodes.getOpcode(i), opcodes.getOp1(i), operand2);
    this.istore[address] = i;
  };

  this.getNextAddress = function() {
    return this.istore.length;
  };

  this.setStartAddress = function() {
    this.startAddress = this.getNextAddress();
  };
};

module.exports = Compiler;