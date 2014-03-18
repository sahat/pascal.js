var OPCODES = require('./opcodes');
var Token = require('./token');
var PascalError = require('./pascal_error');

var Node = function(nodeType, token, additionalFields) {
  this.nodeType = nodeType;
  this.token = token;
  this.symbolTable = null;
  this.expressionType = null;
  this.symbol = null;
  this.symbolLookup = null;
  for (var field in additionalFields) {
    if (additionalFields.hasOwnProperty(field)) {
      this[field] = additionalFields[field];
    }
  }

  this.setSymbolTable = function(symbolTable) {
    this.symbolTable = symbolTable;
  };

  this.log = function() {
    console.log(JSON.stringify(this, null, 4));
  };

  this.isNumericType = function() {
    return this !== null && this.nodeType === Node.SIMPLE_TYPE && (this.typeCode == OPCODES.C || this.typeCode == OPCODES.I || this.typeCode == OPCODES.R);
  };

  this.isBooleanType = function() {
    return this !== null && this.nodeType === Node.SIMPLE_TYPE && this.typeCode == OPCODES.B;
  };

  this.isVoidType = function() {
    return this !== null && this.nodeType === Node.SIMPLE_TYPE && this.typeCode == OPCODES.P;
  };

  this.isSameIdentifier = function(other) {
    if (this.nodeType !== Node.IDENTIFIER || other.nodeType !== Node.IDENTIFIER) {
      throw new PascalError(this.token, 'not an identifier');
    }
    return this.token.tokenValue.toLowerCase() === other.token.tokenValue.toLowerCase();
  };

  this.isSimpleType = function(typeCode) {
    return this.nodeType === Node.SIMPLE_TYPE && this.typeCode === typeCode;
  };

  this.getNumber = function() {
    if (this.nodeType === Node.TK_NUMBER) {
      return parseFloat(this.token.tokenValue);
    } else {
      throw new PascalError(this.token, 'expected a number');
    }
  };

  this.getBoolean = function() {
    if (this.nodeType === Node.BOOLEAN) {
      return this.token.tokenValue.toLowerCase() === 'true';
    } else {
      throw new PascalError(this.token, 'expected a boolean');
    }
  };

  this.getSimpleTypeCode = function() {
    if (this.nodeType === Node.SIMPLE_TYPE) {
      return this.typeCode;
    } else {
      throw new PascalError(this.token, "expected a simple type");
    }
  };

  this.getRangeLowBound = function() {
    if (this.nodeType === Node.RANGE) {
      return this.low.getNumber();
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  this.getRangeHighBound = function() {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber();
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  this.getRangeSize = function() {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber() - this.low.getNumber() + 1;
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  this.getField = function(fieldToken) {
    if (this.nodeType !== Node.RECORD_TYPE) {
      throw new PascalError(this.token, "expected a record");
    }

    if (fieldToken.tokenType !== Token.TK_IDENTIFIER) {
      throw new PascalError(fieldToken, "expected a field name");
    }

    for (var i = 0; i < this.fields.length; i++) {
      var field = this.fields[i];
      if (field.name.token.isEqualTo(fieldToken)) {
        return field;
      }
    }

    throw new PascalError(fieldToken, "field not found in record");
  };


  this.getConstantValue = function() {
    switch (this.nodeType) {
      case Node.TK_NUMBER:
        return this.getNumber();
      case Node.BOOLEAN:
        return this.getBoolean();
      case Node.TK_STRING:
        return this.token.tokenValue;
      default:
        throw new PascalError(this.token, "cannot get constant value of node type " + this.nodeType);
    }
  };

  this.getTotalParameterSize = function() {
    if (this.nodeType !== Node.SUBPROGRAM_TYPE) {
      throw new PascalError(this.token, 'cannot get parameter size of non-subprogram');
    }
    var size = 0;
    for (var i = 0; i < this.parameters.length; i++) {
      var parameter = this.parameters[i];
      size += parameter.byReference ? 1 : parameter.type.getTypeSize();
    }
    return size;
  };

  this.getTypeSize = function() {
    var size;

    switch (this.nodeType) {
      case Node.SIMPLE_TYPE:
        size = 1;
        break;
      case Node.RECORD_TYPE:
        size = 0;
        for (var i = 0; i < this.fields.length; i++) {
          size += this.fields[i].type.getTypeSize();
        }
        break;
      case Node.ARRAY_TYPE:
        size = this.elementType.getTypeSize();
        for (var i = 0; i < this.ranges.length; i++) {
          size *= this.ranges[i].getRangeSize();
        }
        break;
      default:
        throw new PascalError(this.token, 'cannot get size of type ' + this.print());
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
    // If the destination type is void and we're by reference, then do nothing
    // and allow anything. We're essentially passing into an untyped "var foo"
    // parameter.
    if (type.isVoidType() && this.byReference) {
      return this;
    }

    // Existing type.
    var nodeType = this.expressionType;

    // Must have type defined.
    if (!type) {
      throw new PascalError(this.token, "can't cast to null type");
    }
    if (!nodeType) {
      throw new PascalError(this.token, "can't cast from null type");
    }

    // Must be the same type of node. Can't cast between node types
    // (e.g., array to set).
    if (type.nodeType !== nodeType.nodeType) {
      throw new PascalError(this.token, "can't cast from " + nodeType.nodeType + " to " + type.nodeType);
    }

    // Can cast between some simple types.
    if (type.nodeType === Node.SIMPLE_TYPE) {
      if (type.typeCode !== nodeType.typeCode) {
        // They're different simple types.
        var typeCode = type.typeCode;
        var nodeTypeCode = nodeType.typeCode;

        if (typeCode === OPCODES.A || nodeTypeCode === OPCODES.A || typeCode === OPCODES.B || nodeTypeCode === OPCODES.B || typeCode === OPCODES.S || nodeTypeCode === OPCODES.S || typeCode === OPCODES.T || nodeTypeCode === OPCODES.T || typeCode === OPCODES.P || nodeTypeCode === OPCODES.P || typeCode === OPCODES.X || nodeTypeCode === OPCODES.X) {

          // These can't be cast.
          throw new PascalError(this.token, "can't cast from " + OPCODES.typeCodeToName(nodeTypeCode) + " to " + OPCODES.typeCodeToName(typeCode));
        }

        // Can always cast to a real.
        if (typeCode === OPCODES.R || (typeCode === OPCODES.I && nodeTypeCode !== OPCODES.R)) {

          var node = new Node(Node.CAST, type.token, {
            type: type,
            expression: this
          });
          node.expressionType = type;
          return node;
        }

        // Can't cast.
        throw new PascalError(this.token, "can't cast from " + OPCODES.typeCodeToName(nodeTypeCode) + " to " + OPCODES.typeCodeToName(typeCode));
      } else {
        // Same simple typeCode. If they're pointers, then they
        // must be compatible types or the source must be nil.
        if (type.typeCode === OPCODES.A) {
          if (!nodeType.typeName) {
            // Assigning from Nil, always allowed.
          } else if (!type.typeName) {
            // Assigning to generic pointer, always allowed.
          } else if (type.typeName.isSameIdentifier(nodeType.typeName)) {
            // Same pointer type.
          } else {
            // Incompatible pointers, disallow. XXX test this.
            throw new PascalError(this.token, "can't cast from pointer to " + nodeType.print() + " to pointer to " + type.print());
          }
        }
      }
    } else {
      // Complex type. XXX We should verify that they're of the same type.
    }

    // Nothing to cast, return existing node.
    return this;
  };
};

Node.IDENTIFIER = 0;
Node.TK_NUMBER = 1;
Node.TK_STRING = 2;
Node.BOOLEAN = 3;
Node.POINTER = 4;

/**
 * @param name
 * @param declarations
 * @param block
 */

Node.PROGRAM = 10;
Node.PROCEDURE = 11;
Node.FUNCTION = 12;

/**
 * @param name
 */
Node.USES = 13;


/**
 * @param name
 * @param type
 */

Node.VAR = 14;


/**
 * @param low
 * @param high
 */

Node.RANGE = 15;


/**
 * @param statements
 */

Node.BLOCK = 16;

/**
 * @param name
 * @param type
 * @param byReference
 */

Node.PARAMETER = 17;

/**
 * @param type
 * @param expression
 */

Node.CAST = 18;

/**
 * @param name
 * @param type
 * @param value
 */

Node.CONST = 19;

/**
 * @param lhs
 * @param rhs
 */

Node.ASSIGNMENT = 20;

/**
 * @param name
 * @param argumentList
 */

Node.PROCEDURE_CALL = 21;

/**
 * @param block
 * @param expression
 */

Node.REPEAT = 22;

/**
 * @param variable
 * @param fromExpr
 * @param toExpr
 * @param body
 * @param downTo
 */

Node.FOR = 23;

/**
 * @param expression
 * @param thenStatement
 * @param elseStatement
 */

Node.IF = 24;
Node.EXIT = 25;
Node.FIELD = 26;
Node.WHILE = 27;
Node.TYPED_CONST = 28;
Node.NOT = 30;
Node.NEGATIVE = 31;
Node.ADDITION = 40;
Node.SUBTRACTION = 41;
Node.MULTIPLICATION = 42;
Node.DIVISION = 43;
Node.EQUALITY = 44;
Node.INEQUALITY = 45;
Node.LESS_THAN = 46;
Node.GREATER_THAN = 47;
Node.LESS_THAN_OR_EQUAL_TO = 48;
Node.GREATER_THAN_OR_EQUAL_TO = 49;
Node.AND = 50;
Node.OR = 51;
Node.INTEGER_DIVISION = 52;
Node.MOD = 53;
Node.FIELD_DESIGNATOR = 54;
Node.FUNCTION_CALL = 60;
Node.ARRAY = 61;
Node.TYPE = 62;
Node.ADDRESS_OF = 63;
Node.DEREFERENCE = 64;
Node.SIMPLE_TYPE = 70;
Node.ENUM_TYPE = 71;
Node.RECORD_TYPE = 73;
Node.ARRAY_TYPE = 74;
Node.SET_TYPE = 75;
Node.SUBPROGRAM_TYPE = 76;


Node.pointerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.A});
Node.booleanType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.B});
Node.charType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.C});
Node.integerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.I});
Node.voidType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.P});
Node.realType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.R});
Node.stringType = new Node(Node.SIMPLE_TYPE, null, {typeCode: OPCODES.S});

Node.makeIdentifierNode = function(name) {
  return new Node(Node.IDENTIFIER, new Token(name, Token.TK_IDENTIFIER));
};

Node.makeNumberNode = function(value) {
  return new Node(Node.TK_NUMBER, new Token("" + value, Token.TK_NUMBER));
};

Node.makeBooleanNode = function(value) {
  return new Node(Node.BOOLEAN, new Token(value ? "True" : "False", Token.TK_IDENTIFIER));
};

Node.makePointerNode = function(value) {
  if (value !== null) {
    throw new PascalError(null, "nil is the only pointer constant");
  }
  return new Node(Node.POINTER, new Token("Nil", Token.TK_IDENTIFIER));
};

Node.nodeLabel = {};
Node.nodeLabel[Node.PROGRAM] = 'program';
Node.nodeLabel[Node.PROCEDURE] = 'procedure';
Node.nodeLabel[Node.FUNCTION] = 'function';

module.exports = Node;
