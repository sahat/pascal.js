var opcodes = require('./opcodes');
var Token = require('./token');

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

  this.log = function() {
    console.log(JSON.stringify(this, null, 4));
  };

  this.isVoidType = function() {
    return this !== null && this.nodeType === Node.SIMPLE_TYPE && this.typeCode == opcodes.P;
  };

  this.isSimpleType = function(typeCode) {
    return this.nodeType === Node.SIMPLE_TYPE && this.typeCode === typeCode;
  };

  this.getNumber = function() {
    if (this.nodeType === Node.TK_NUMBER) {
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

  this.getField = function(fieldToken) {
    if (this.nodeType !== Node.RECORD_TYPE) {
    }

    if (fieldToken.tokenType !== Token.TK_IDENTIFIER) {
    }

    for (var i = 0; i < this.fields.length; i++) {
      var field = this.fields[i];
      if (field.name.token.isEqualTo(fieldToken)) {
        return field;
      }
    }

  };


  this.getConstantValue = function() {
    switch (this.nodeType) {
      case Node.TK_NUMBER:
        return this.getNumber();
      case Node.BOOLEAN:
        return this.getBoolean();
      case Node.TK_STRING:
        return this.token.tokenValue;
    }
  };

  this.getTotalParameterSize = function() {
    if (this.nodeType !== Node.SUBPROGRAM_TYPE) {
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
    }
    return size;
  };

  this.print = function(indent) {
    var str = '';

    indent = indent || '';

    switch (this.nodeType) {
      case Node.IDENTIFIER:
      case Node.TK_NUMBER:
      case Node.BOOLEAN:
      case Node.POINTER:
        str += this.token.tokenValue;
        break;
      case Node.TK_STRING:
        str += "'" + this.token.tokenValue + "'";
        break;
      case Node.PROGRAM:
      case Node.PROCEDURE:
      case Node.FUNCTION:
        if (this.nodeType !== Node.PROGRAM) {
          indent += '    ';
          str += '\n';
        }

        str += indent + Node.nodeLabel[this.nodeType] + ' ' + this.name.token.tokenValue;

        str += this.expressionType.print() + ';\n\n';

        for (var i = 0; i < this.declarations.length; i++) {
          str += this.declarations[i].print(indent) + ';\n';
        }

        // Main block.
        str += '\n' + this.block.print(indent);

        if (this.nodeType === Node.PROGRAM) {
          str += '.\n';
        }
        break;
      case Node.USES:
        str += indent + "uses " + this.name.token.tokenValue;
        break;
      case Node.VAR:
        str += indent + "var " + this.name.print() + " : " + this.type.print();
        break;
      case Node.RANGE:
        str += this.low.print() + ".." + this.high.print();
        break;
      case Node.BLOCK:
        str += indent + "begin\n";
        for (var i = 0; i < this.statements.length; i++) {
          str += this.statements[i].print(indent + "    ") + ";\n";
        }
        str += indent + "end";
        break;
      case Node.PARAMETER:
        str += (this.byReference ? "var " : "") + this.name.print() + " : " + this.type.print();
        break;
      case Node.CAST:
        str += this.type.print() + "(" + this.expression.print() + ")";
        break;
      case Node.CONST:
        str += indent + "const " + this.name.print();
        if (this.type !== null) {
          str += " { : " + this.type.print() + " }";
        }
        str += " = " + this.value.print();
        break;
      case Node.ASSIGNMENT:
        str += indent + this.lhs.print() + " := " + this.rhs.print();
        break;
      case Node.PROCEDURE_CALL:
      case Node.FUNCTION_CALL:
        if (this.nodeType === Node.PROCEDURE_CALL) {
          str += indent;
        }
        str += this.name.print();
        var argumentList = [];
        for (var i = 0; i < this.argumentList.length; i++) {
          argumentList.push(this.argumentList[i].print(indent));
        }
        if (argumentList.length > 0) {
          str += "(" + argumentList.join(", ") + ")";
        }
        break;
      case Node.REPEAT:
        str += indent + "repeat\n";
        str += this.block.print(indent + "    ");
        str += "\n" + indent + "until " + this.expression.print();
        break;
      case Node.FOR:
        str += indent + "for " + this.variable.print() + " := " + this.fromExpr.print() + (this.downto ? " downto " : " to ") + this.toExpr.print() + " do\n";
        str += this.body.print(indent + "    ");
        break;
      case Node.IF:
        str += indent + "if " + this.expression.print() + " then\n";
        str += this.thenStatement.print(indent + "    ");
        if (this.elseStatement) {
          str += "\n" + indent + "else\n";
          str += this.elseStatement.print(indent + "    ");
        }
        break;
      case Node.EXIT:
        str += indent + "Exit";
        break;
      case Node.FIELD:
        str += indent + this.name.print() + " : " + this.type.print(indent);
        break;
      case Node.WHILE:
        str += indent + "while " + this.expression.print() + " do\n" + this.statement.print(indent + "    ");
        break;
      case Node.TYPED_CONST:
        str += indent + "const " + this.name.print();
        str += " : " + this.type.print();
        str += " = " + this.rawData.print();
        break;
      case Node.NOT:
        str += "Not " + this.expression.print();
        break;
      case Node.NEGATIVE:
        str += "-" + this.expression.print();
        break;
      case Node.ADDITION:
        str += this.lhs.print() + " + " + this.rhs.print();
        break;
      case Node.SUBTRACTION:
        str += this.lhs.print() + " - " + this.rhs.print();
        break;
      case Node.MULTIPLICATION:
        str += "(" + this.lhs.print() + "*" + this.rhs.print() + ")";
        break;
      case Node.DIVISION:
        str += this.lhs.print() + "/" + this.rhs.print();
        break;
      case Node.EQUALITY:
        str += this.lhs.print() + " = " + this.rhs.print();
        break;
      case Node.INEQUALITY:
        str += this.lhs.print() + " <> " + this.rhs.print();
        break;
      case Node.LESS_THAN:
        str += this.lhs.print() + " < " + this.rhs.print();
        break;
      case Node.GREATER_THAN:
        str += this.lhs.print() + " > " + this.rhs.print();
        break;
      case Node.LESS_THAN_OR_EQUAL_TO:
        str += this.lhs.print() + " <= " + this.rhs.print();
        break;
      case Node.GREATER_THAN_OR_EQUAL_TO:
        str += this.lhs.print() + " >= " + this.rhs.print();
        break;
      case Node.AND:
        str += this.lhs.print() + " and " + this.rhs.print();
        break;
      case Node.OR:
        str += this.lhs.print() + " or " + this.rhs.print();
        break;
      case Node.INTEGER_DIVISION:
        str += this.lhs.print() + " div " + this.rhs.print();
        break;
      case Node.MOD:
        str += this.lhs.print() + " mod " + this.rhs.print();
        break;
      case Node.FIELD_DESIGNATOR:
        str += this.variable.print() + "." + this.field.name.print();
        break;
      case Node.ARRAY:
        var indices = [];
        for (var i = 0; i < this.indices.length; i++) {
          indices.push(this.indices[i].print());
        }
        str += this.variable.print() + "[" + indices.join(",") + "]";
        break;
      case Node.TYPE:
        str += indent + "type " + this.name.print() + " = " + this.type.print();
        break;
      case Node.ADDRESS_OF:
        str += "@" + this.variable.print();
        break;
      case Node.DEREFERENCE:
        str += this.variable.print() + "^";
        break;
      case Node.SIMPLE_TYPE:
        if (this.typeCode === defs.A) {
          if (this.typeName) {
            str += "^" + this.typeName.print();
          } else {
            // Generic pointer.
            str += "Pointer";
          }
        } else {
          str += defs.typeCodeToName(this.typeCode);
        }
        break;
      case Node.RECORD_TYPE:
        str += "record\n";
        for (var i = 0; i < this.fields.length; i++) {
          str += this.fields[i].print(indent + "    ") + ";\n";
        }
        str += indent + "end";
        break;
      case Node.ARRAY_TYPE:
        var ranges = [];
        for (var i = 0; i < this.ranges.length; i++) {
          ranges.push(this.ranges[i].print());
        }
        str += "array[" + ranges.join(",") + "] of " + this.elementType.print();
        break;
      case Node.SUBPROGRAM_TYPE:
        // Print parameters.
        var parameters = [];
        for (var i = 0; i < this.parameters.length; i++) {
          parameters.push(this.parameters[i].print());
        }
        if (parameters.length > 0) {
          str += "(" + parameters.join("; ") + ")";
        }

        // Functions only: return type.
        if (!this.returnType.isSimpleType(defs.P)) {
          str += " : " + this.returnType.print();
        }
        break;
      default:
        str = "<UNKNOWN>";
        break;
    }

    return str;
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
    if (type.isVoidType() && this.byReference) {
      return this;
    }

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
Node.TK_NUMBER = 1;
Node.TK_STRING = 2;
Node.BOOLEAN = 3;
Node.POINTER = 4;
Node.PROGRAM = 10;
Node.PROCEDURE = 11;
Node.FUNCTION = 12;
Node.USES = 13;
Node.VAR = 14;
Node.RANGE = 15;
Node.BLOCK = 16;
Node.PARAMETER = 17;
Node.CAST = 18;
Node.CONST = 19;
Node.ASSIGNMENT = 20;
Node.PROCEDURE_CALL = 21;
Node.REPEAT = 22;
Node.FOR = 23;
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

Node.pointerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.A});
Node.booleanType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.B});
Node.charType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.C});
Node.integerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.I});
Node.voidType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.P});
Node.realType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.R});
Node.stringType = new Node(Node.SIMPLE_TYPE, null, {typeCode: opcodes.S});

Node.makeIdentifierNode = function(name) {
  return new Node(Node.IDENTIFIER, new Token(name, Token.TK_IDENTIFIER));
};

Node.makeNumberNode = function(value) {
  return new Node(Node.TK_NUMBER, new Token(value.toString(), Token.TK_NUMBER));
};

Node.makeBooleanNode = function(value) {
  return new Node(Node.BOOLEAN, new Token(value ? 'True' : 'False', Token.TK_IDENTIFIER));
};

Node.makePointerNode = function(value) {
  return new Node(Node.POINTER, new Token('Nil', Token.TK_IDENTIFIER));
};

Node.nodeLabel = {};
Node.nodeLabel[Node.PROGRAM] = 'program';
Node.nodeLabel[Node.PROCEDURE] = 'procedure';
Node.nodeLabel[Node.FUNCTION] = 'function';

module.exports = Node;
