var opcodes = require('./opcodes');
var Token = require('./token');

var Node = function(nodeType, token, extaFields) {
  this.nodeType = nodeType;
  this.token = token;
  this.symbolTable = null;
  this.expressionType = null;
  this.symbol = null;
  this.symbolLookup = null;
  for (var field in extaFields) {
    if (extaFields.hasOwnProperty(field)) {
      this[field] = extaFields[field];
    }
  }

  this.isVoidType = function() {
    return this !== null && this.nodeType === Node.SIMPLE_TYPE && this.typeCode == opcodes.P;
  };

  this.isSimpleType = function(typeCode) {
    return this.nodeType === Node.SIMPLE_TYPE && this.typeCode === typeCode;
  };

  this.getNumber = function() {
    if (this.nodeType === Node.NUMBER) {
      return parseFloat(this.token.tokenValue);
    }
  };

  this.getBoolean = function() {
    if (this.nodeType === Node.BOOLEAN) {
      return this.token.tokenValue.toLowerCase() === 'true';
    }
  };

  this.getSimpleTypeCode = function() {
    if (this.nodeType === Node.SIMPLE_TYPE) {
      return this.typeCode;
    }
  };

  this.getRangeLowBound = function() {
    if (this.nodeType === Node.RANGE) {
      return this.low.getNumber();
    }
  };

  this.getRangeHighBound = function() {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber();
    }
  };

  this.getRangeSize = function() {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber() - this.low.getNumber() + 1;
    }
  };



  this.getTypeSize = function() {
    var size;

    switch (this.nodeType) {
      case Node.SIMPLE_TYPE:
        size = 1;
        break;
      case Node.ARRAY_TYPE:
        size = this.elementType.getTypeSize();
        for (var i = 0; i < this.ranges.length; i++) {
          size *= this.ranges[i].getRangeSize();
        }
        break;
    }
    return size;
  };


  this.withExpressionType = function(expressionType) {
    this.expressionType = expressionType;
    return this;
  };

  this.withExpressionTypeFrom = function(node) {
    this.expressionType = node.expressionType;
    return this;
  };

  this.castToType = function(type) {
    var nodeType = this.expressionType;

    if (type.nodeType === Node.SIMPLE_TYPE) {
      if (type.typeCode !== nodeType.typeCode) {
        var typeCode = type.typeCode;
        var nodeTypeCode = nodeType.typeCode;


        if (typeCode === opcodes.R || (typeCode === opcodes.I && nodeTypeCode !== opcodes.R)) {

          var node = new Node(Node.CAST, type.token, {
            type: type,
            expression: this
          });
          node.expressionType = type;
          return node;
        }

      }
    }

    return this;
  };
};

Node.IDENTIFIER = 0;
Node.NUMBER = 1;
Node.STRING = 2;
Node.BOOLEAN = 3;
Node.POINTER = 4;
Node.PROGRAM = 5;
Node.VAR = 6;
Node.RANGE = 7;
Node.BLOCK = 8;
Node.PARAMETER = 9;
Node.ASSIGNMENT = 10;
Node.FOR = 11;
Node.IF = 12;
Node.NOT = 13;
Node.NEGATIVE = 14;
Node.ADDITION = 15;
Node.SUBTRACTION = 16;
Node.MULTIPLICATION = 17;
Node.EQUALITY = 18;
Node.INEQUALITY = 19;
Node.LESS_THAN = 20;
Node.GREATER_THAN = 21;
Node.LESS_OR_EQUAL_TO = 22;
Node.GREATER_OR_EQUAL_TO = 23;
Node.AND = 24;
Node.OR = 25;
Node.INTEGER_DIVISION = 26;
Node.MOD = 27;
Node.TYPE = 28;
Node.SIMPLE_TYPE = 29;
Node.PROCEDURE_CALL = 30;

Node.pointerType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.A });
Node.booleanType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.B });
Node.charType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.C });
Node.integerType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.I });
Node.voidType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.P });
Node.stringType = new Node(Node.SIMPLE_TYPE, null, { typeCode: opcodes.S });

Node.makeIdentifierNode = function(name) {
  return new Node(Node.IDENTIFIER, new Token(name, Token.TK_IDENTIFIER));
};

Node.makeNumberNode = function(value) {
  return new Node(Node.NUMBER, new Token(value.toString(), Token.TK_NUMBER));
};

Node.makeBooleanNode = function(value) {
  return new Node(Node.BOOLEAN, new Token(value ? 'True' : 'False', Token.TK_IDENTIFIER));
};

Node.nodeLabel = {};
Node.nodeLabel[Node.PROGRAM] = 'program';

module.exports = Node;
