var opcodes = require('./opcodes');
var Node = require('./node');
var Token = require('./token');
var SymbolTable = require('./symbol_table');

function Parser(scanner) {
  this.scanner = scanner;

  this.parse = function(symbolTable) {
    var node = this.parseSubprogramDeclaration(symbolTable, Node.PROGRAM);
    return node;
  };

  this.moreEntitiesToCome = function(separator, terminator) {
    var token = this.scanner.lookAhead();
    if (token.isSymbol(separator)) {
      this.scanner.next();
      return true;
    } else if (token.isSymbol(terminator)) {
      return false;
    }
  };

  this.expectReservedWord = function(reservedWord, message) {
    var token = this.scanner.next();
    message = message || ("expected reserved word \"" + reservedWord + "\"");
    return token;
  };

  this.expectSymbol = function(symbol, message) {
    var token = this.scanner.next();
    return token;
  };

  this.expectIdentifier = function(message) {
    var token = this.scanner.next();
    return token;
  };

  this.parseDeclarations = function(symbolTable) {
    var declarations = [];
    while (!this.scanner.lookAhead().isReserved('begin')) {
      var nodes = this.parseDeclaration(symbolTable);
      declarations.push.apply(declarations, nodes);
    }

    return declarations;
  };

  this.parseDeclaration = function(symbolTable) {
    var token = this.scanner.lookAhead();

    if (token.isReserved('uses')) {
      return this.parseUsesDeclaration(symbolTable);
    } else if (token.isReserved("var")) {
      this.expectReservedWord("var");
      return this.parseVarDeclaration(symbolTable);
    } else if (token.isReserved("const")) {
      this.expectReservedWord("const");
      return this.parseConstDeclaration(symbolTable);
    } else if (token.isReserved("type")) {
      this.expectReservedWord("type");
      return this.parseTypeDeclaration(symbolTable);
    } else if (token.isReserved("procedure")) {
      return [this.parseSubprogramDeclaration(symbolTable, Node.PROCEDURE)];
    } else if (token.isReserved("function")) {
      return [this.parseSubprogramDeclaration(symbolTable, Node.FUNCTION)];
    }
  };

  this.parseUsesDeclaration = function(symbolTable) {
    var usesToken = this.expectReservedWord("uses");
    var nodes = [];
    do {
      var token = this.expectIdentifier("expected module name");
      var node = new Node(Node.USES, usesToken, {
        name: new Node(Node.IDENTIFIER, token)
      });
      nodes.push(node);
    } while (this.moreEntitiesToCome(",", ";"));
    this.expectSymbol(";");
    return nodes;
  };

  this.parseVarDeclaration = function(symbolTable) {
    var nodes = [];
    do {
      var startNode = nodes.length;
      do {
        var nameToken = this.expectIdentifier("expected variable name");
        var node = new Node(Node.VAR, null, {
          name: new Node(Node.IDENTIFIER, nameToken)
        });
        nodes.push(node);
      } while (this.moreEntitiesToCome(",", ":"));
      this.expectSymbol(":");
      var type = this._parseType(symbolTable);
      for (var i = startNode; i < nodes.length; i++) {
        nodes[i].type = type;
        nodes[i].symbol = symbolTable.addSymbol(
          nodes[i].name.token.tokenValue, Node.VAR, type);
      }
      this.expectSymbol(";");
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    return nodes;
  };

  this.parseConstDeclaration = function(symbolTable) {
    var nodes = [];

    do {
      var token = this.expectIdentifier('Expected Constant Name');
      var identifierNode = new Node(Node.IDENTIFIER, token);

      var type = null;
      token = this.scanner.lookAhead();
      if (token.isSymbol(":")) {
        this.scanner.next();
        type = this._parseType(symbolTable);
      }

      this.expectSymbol("=");

      var node;
      if (type === null) {
        var expression = this._parseExpression(symbolTable);
        node = new Node(Node.CONST, null, {
          name: identifierNode,
          type: expression.expressionType,
          value: expression
        });
      } else {
        var rawData;

        if (type.nodeType === Node.ARRAY_TYPE) {
          rawData = this.parseArrayConstant(symbolTable, type);
        } else if (type.nodeType === Node.SIMPLE_TYPE) {
          rawData = new RawData();
          rawData.addNode(this._parseExpression(symbolTable));
        }

        node = new Node(Node.TYPED_CONST, null, {
          name: identifierNode,
          type: type,
          rawData: rawData
        });
      }

      node.symbol = symbolTable.addSymbol(identifierNode.token.tokenValue,
        node.nodeType, node.type);
      if (type === null) {
        node.symbol.value = node.value;
      }
      nodes.push(node);

      this.expectSymbol(";");
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    return nodes;
  };

  this.parseArrayConstant = function(symbolTable, type) {
    var rawData = new RawData();

    var self = this;
    var parseDimension = function(d) {
      self.expectSymbol("(");

      var low = type.ranges[d].getRangeLowBound();
      var high = type.ranges[d].getRangeHighBound();
      for (var i = low; i <= high; i++) {
        if (d === type.ranges.length - 1) {
          // Parse the next constant.
          rawData.addNode(self._parseExpression(symbolTable));
        } else {
          parseDimension(d + 1);
        }
        if (i < high) {
          self.expectSymbol(",");
        }
      }

      self.expectSymbol(")");
    };

    parseDimension(0);

    return rawData;
  };

  this.parseTypeDeclaration = function(symbolTable) {
    var nodes = [];

    var incompleteTypes = [];

    do {
      var token = this.expectIdentifier('Expected Type Name');
      var identifierNode = new Node(Node.IDENTIFIER, token);
      var equalToken = this.expectSymbol("=");
      var type = this._parseType(symbolTable, incompleteTypes);

      var node = new Node(Node.TYPE, equalToken, {
        name: identifierNode,
        type: type
      });
      node.symbol = symbolTable.addType(identifierNode.token.tokenValue, type);
      nodes.push(node);
      this.expectSymbol(";");
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    for (var i = 0; i < incompleteTypes.length; i++) {
      var node = incompleteTypes[i];
      node.type = symbolTable.getType(node.typeName.token).symbol.type;
    }
    return nodes;
  };

  this.parseSubprogramDeclaration = function(symbolTable, nodeType) {
    var declType = Node.nodeLabel[nodeType];
    var procedureToken = this.expectReservedWord(declType);
    var nameToken = this.expectIdentifier("expected " + declType + " name");
    var symbolTable = new SymbolTable(symbolTable);
    var token = this.scanner.lookAhead();
    var parameters = [];
    if (token.isSymbol("(")) {
      this.expectSymbol("(");
      var start = 0;
      do {
        var byReference = false;
        if (this.scanner.lookAhead().isReserved("var")) {
          this.expectReservedWord("var");
          byReference = true;
        }
        do {
          token = this.expectIdentifier('Expected Parameter Name');
          parameters.push(new Node(Node.PARAMETER, colon, {
            name: new Node(Node.IDENTIFIER, token),
            byReference: byReference
          }));
        } while (this.moreEntitiesToCome(',', ':'));
        var colon = this.expectSymbol(":");
        var type = this._parseType(symbolTable);
        for (var i = start; i < parameters.length; i++) {
          parameters[i].type = type;
        }
        start = parameters.length;
      } while (this.moreEntitiesToCome(';', ')'));

      this.expectSymbol(")");
    }

    for (var i = 0; i < parameters.length; i++) {
      var parameter = parameters[i];
      var symbol = symbolTable.addSymbol(parameter.name.token.tokenValue, Node.PARAMETER,
        parameter.type, parameter.byReference);
    }

    var returnType;
    if (nodeType === Node.FUNCTION) {
      this.expectSymbol(":");
      returnType = this._parseType(symbolTable);
    } else {
      returnType = Node.voidType;
    }
    this.expectSymbol(";");
    if (nodeType === Node.FUNCTION) {
      var name = nameToken.tokenValue;
      symbolTable.symbols[name.toLowerCase()] = new Symbol(name, returnType, 0, false);
    }
    var type = new Node(Node.SUBPROGRAM_TYPE, procedureToken, {
      parameters: parameters,
      returnType: returnType
    });
    var symbol = symbolTable.parentSymbolTable.addSymbol(nameToken.tokenValue,
      Node.SUBPROGRAM_TYPE, type);
    var declarations = this.parseDeclarations(symbolTable);
    var block = this.parseBlock(symbolTable, 'begin', 'end');
    var node = new Node(nodeType, procedureToken, {
      name: new Node(Node.IDENTIFIER, nameToken),
      declarations: declarations,
      block: block
    });
    node.symbol = symbol;
    node.symbolTable = symbolTable;
    node.expressionType = type;
    this.expectSymbol(nodeType === Node.PROGRAM ? "." : ";");
    return node;
  };

  this.parseBlock = function(symbolTable, startWord, endWord) {
    var token = this.expectReservedWord(startWord);
    var statements = [];
    var foundEnd = false;
    while (!foundEnd) {
      token = this.scanner.lookAhead();
      if (token.isReserved(endWord)) {
        this.scanner.next();
        foundEnd = true;
      } else if (token.isSymbol(";")) {
        this.scanner.next();
      } else {
        statements.push(this.parseStatement(symbolTable));

        // After an actual statement, we require a semicolon or end of block.
        token = this.scanner.lookAhead();

      }
    }

    return new Node(Node.BLOCK, token, {
      statements: statements
    });
  };

  this.parseStatement = function(symbolTable) {
    var node;
    var token = this.scanner.lookAhead();

    if (token.isReserved('if')) {
      node = this.parseIfStatement(symbolTable);
    } else if (token.isReserved('while')) {
      node = this.parseWhileStatement(symbolTable);
    } else if (token.isReserved('repeat')) {
      node = this.parseRepeatStatement(symbolTable);
    } else if (token.isReserved('for')) {
      node = this.parseForStatement(symbolTable);
    } else if (token.isReserved('begin')) {
      node = this.parseBlock(symbolTable, 'begin', 'end');
    } else if (token.isReserved('exit')) {
      node = this.parseExitStatement(symbolTable);
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      node = this.parseVariable(symbolTable);

      token = this.scanner.lookAhead();

      if (token.isSymbol(':=')) {
        node = this.parseAssignment(symbolTable, node);
      } else if (node.nodeType === Node.IDENTIFIER) {
        node = this.parseProcedureCall(symbolTable, node);
      }
    }

    return node;
  };

  this.parseVariable = function(symbolTable) {
    var identifierToken = this.expectIdentifier('expected identifier');
    var node = new Node(Node.IDENTIFIER, identifierToken);

    var symbolLookup = symbolTable.getSymbol(identifierToken);
    node.symbolLookup = symbolLookup;
    node.expressionType = symbolLookup.symbol.type;

    while (true) {
      var nextToken = this.scanner.lookAhead();

      if (nextToken.isSymbol('[')) {
        node = this.parseArrayDereference(symbolTable, node);
      } else if (nextToken.isSymbol('.')) {
        node = this.parseRecordDesignator(symbolTable, node);
      } else if (nextToken.isSymbol('^')) {
        this.expectSymbol('^');
        var variable = node;

        node = new Node(Node.DEREFERENCE, nextToken, {
          variable: node
        });
        node.expressionType = variable.expressionType.type;
      } else {
        break;
      }
    }

    return node;
  };

  this.parseAssignment = function(symbolTable, variable) {
    var assignToken = this.expectSymbol(":=");

    var expression = this._parseExpression(symbolTable);
    return new Node(Node.ASSIGNMENT, assignToken, {
      lhs: variable,
      rhs: expression.castToType(variable.expressionType)
    });
  };

  this.parseProcedureCall = function(symbolTable, identifier) {
    var symbolLookup = symbolTable.getSymbol(identifier.token);
    var symbol = symbolLookup.symbol;
    identifier.symbolLookup = symbolLookup;

    if (symbol.type.nodeType === Node.SUBPROGRAM_TYPE && symbol.type.returnType.isVoidType()) {
      var argumentList = this.parseArguments(symbolTable, symbol.type);
      if (symbol.name.toLowerCase() === "new" && symbol.isNative) {
        if (argumentList.length === 1) {
          argumentList.push(Node.makeNumberNode(
            argumentList[0].expressionType.type.getTypeSize()));
        }
      }

      return new Node(Node.PROCEDURE_CALL, identifier.token, {
        name: identifier,
        argumentList: argumentList
      });
    }
  };

  this.parseArguments = function(symbolTable, type) {
    var argumentList = [];

    if (this.scanner.lookAhead().isSymbol("(")) {
      this.expectSymbol("(");
      var token = this.scanner.lookAhead();
      if (token.isSymbol(")")) {
        this.scanner.next();
      } else {
        do {
          var argumentIndex = argumentList.length;
          var parameter;
          if (argumentIndex < type.parameters.length) {
            parameter = type.parameters[argumentIndex];
          } else {
            parameter = null;
          }

          var argument;
          if (parameter && parameter.byReference) {
            argument = this.parseVariable(symbolTable);
            argument.byReference = true;
          } else {
            argument = this._parseExpression(symbolTable);
          }
          if (parameter) {
            argument = argument.castToType(parameter.type);
          }
          argumentList.push(argument);
        } while (this.moreEntitiesToCome(',', ')'));
        this.expectSymbol(")");
      }
    }

    return argumentList;
  };

  this.parseIfStatement = function(symbolTable) {
    var token = this.expectReservedWord("if");

    var expression = this._parseExpression(symbolTable);


    this.expectReservedWord("then");
    var thenStatement = this.parseStatement(symbolTable);

    var elseStatement = null;
    var elseToken = this.scanner.lookAhead();
    if (elseToken.isReserved("else")) {
      this.expectReservedWord("else");
      var elseStatement = this.parseStatement(symbolTable);
    }

    return new Node(Node.IF, token, {
      expression: expression,
      thenStatement: thenStatement,
      elseStatement: elseStatement
    });
  };

  this.parseWhileStatement = function(symbolTable) {
    var whileToken = this.expectReservedWord("while");

    var expression = this._parseExpression(symbolTable);

    this.expectReservedWord("do", "expected \"do\" for \"while\" loop");

    var statement = this.parseStatement(symbolTable);

    return new Node(Node.WHILE, whileToken, {
      expression: expression,
      statement: statement
    });
  };

  this.parseRepeatStatement = function(symbolTable) {
    var block = this.parseBlock(symbolTable, "repeat", "until");
    var expression = this._parseExpression(symbolTable);

    return new Node(Node.REPEAT, block.token, {
      block: block,
      expression: expression
    });
  };

  this.parseForStatement = function(symbolTable) {
    var token = this.expectReservedWord("for");

    var loopVariableToken = this.expectIdentifier("expected identifier for \"for\" loop");
    this.expectSymbol(":=");
    var fromExpr = this._parseExpression(symbolTable);
    var downto = this.scanner.lookAhead().isReserved("downto");
    if (downto) {
      this.expectReservedWord("downto");
    } else {
      this.expectReservedWord("to");
    }
    var toExpr = this._parseExpression(symbolTable);
    this.expectReservedWord("do");
    var body = this.parseStatement(symbolTable);

    var symbolLookup = symbolTable.getSymbol(loopVariableToken);
    var loopVariableType = symbolLookup.symbol.type;
    var variable = new Node(Node.IDENTIFIER, loopVariableToken);
    variable.symbolLookup = symbolLookup;

    fromExpr = fromExpr.castToType(loopVariableType);
    toExpr = toExpr.castToType(loopVariableType);

    return new Node(Node.FOR, token, {
      variable: variable,
      fromExpr: fromExpr,
      toExpr: toExpr,
      body: body,
      downto: downto
    });
  };


  this._parseType = function(symbolTable, incompleteTypes) {
    var token = this.scanner.next();
    var node;

    if (token.isReserved('array')) {
      this.expectSymbol('[');
      var ranges = [];
      do {
        var range = this.parseRange(symbolTable);
        ranges.push(range);
      } while (this.moreEntitiesToCome(',', ']'));
      this.expectSymbol(']');
      this.expectReservedWord('of');
      var elementType = this._parseType(symbolTable, incompleteTypes);

      node = new Node(Node.ARRAY_TYPE, token, {
        elementType: elementType,
        ranges: ranges
      });
    } else if (token.isReserved('record')) {
      node = this.parseRecordType(symbolTable, token, incompleteTypes);
    } else if (token.isSymbol('^')) {
      var typeNameToken = this.expectIdentifier('expected type identifier');
      var type;
      type = symbolTable.getType(typeNameToken).symbol.type;
      node = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: opcodes.A,
        typeName: new Node(Node.IDENTIFIER, typeNameToken),
        type: type
      });
      if (type === null) {
        if (incompleteTypes) {
          incompleteTypes.push(node);
        }
      }
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      var symbolLookup = symbolTable.getType(token);
      node = symbolLookup.symbol.type;
    }
    node.expressionType = node;

    return node;
  };

  this.parseRecordType = function(symbolTable, token, incompleteTypes) {
    var fields = [];

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol(";")) {
        this.scanner.next();
      } else if (token.isReserved("end")) {
        this.expectReservedWord("end");
        break;
      } else {
        fields.push.apply(fields,
          this._parseRecordSection(symbolTable, token, incompleteTypes));
        var token = this.scanner.lookAhead();

      }
    }

    var offset = 0;
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      field.offset = offset;
      offset += field.type.getTypeSize();
    }

    return new Node(Node.RECORD_TYPE, token, {
      fields: fields
    });
  };

  this._parseRecordSection = function(symbolTable, fieldToken, incompleteTypes) {
    var fields = [];

    do {
      var nameToken = this.expectIdentifier("expected field name");
      var field = new Node(Node.FIELD, fieldToken, {
        name: new Node(Node.IDENTIFIER, nameToken),
        offset: 0
      });
      fields.push(field);
    } while (this.moreEntitiesToCome(",", ":"));

    // Skip colon.
    this.expectSymbol(":");

    // Parse the fields's type.
    var type = this._parseType(symbolTable, incompleteTypes);

    // Set the type of all fields.
    for (var i = 0; i < fields.length; i++) {
      fields[i].type = type;
    }

    return fields;
  };

  this.parseRange = function(symbolTable) {
    var low = this._parseExpression(symbolTable);
    var token = this.expectSymbol("..");
    var high = this._parseExpression(symbolTable);

    return new Node(Node.RANGE, token, {low: low, high: high});
  };

  this._parseExpression = function(symbolTable) {
    return this._parseRelationalExpression(symbolTable);
  };

  this._parseRelationalExpression = function(symbolTable) {
    var node = this.parseAdditiveExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol("=")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.EQUALITY,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<>")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.INEQUALITY,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol(">")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.GREATER_THAN,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.LESS_THAN,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol(">=")) {
        node = this.createBinaryNode(symbolTable, token, node,
          Node.GREATER_THAN_OR_EQUAL_TO,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<=")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.LESS_THAN_OR_EQUAL_TO,
          this.parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseAdditiveExpression = function(symbolTable) {
    var node = this.parseMultiplicativeExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol("+")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.ADDITION,
          this.parseMultiplicativeExpression);
      } else if (token.isSymbol("-")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.SUBTRACTION,
          this.parseMultiplicativeExpression);
      } else if (token.isReserved("or")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.OR,
          this.parseMultiplicativeExpression,
          Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseMultiplicativeExpression = function(symbolTable) {
    var node = this.parseUnaryExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol('*')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.MULTIPLICATION,
          this.parseUnaryExpression);
      } else if (token.isReserved('div')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.INTEGER_DIVISION,
          this.parseUnaryExpression, Node.integerType);
      } else if (token.isReserved('mod')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.MOD,
          this.parseUnaryExpression, Node.integerType);
      } else if (token.isReserved('and')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.AND,
          this.parseUnaryExpression, Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseUnaryExpression = function(symbolTable) {
    var node;

    // Parse unary operator.
    var token = this.scanner.lookAhead();
    if (token.isSymbol("-")) {
      // Negation.
      this.expectSymbol("-");

      var expression = this.parseUnaryExpression(symbolTable);
      node = new Node(Node.NEGATIVE, token, {
        expression: expression
      }).withExpressionTypeFrom(expression);
    } else if (token.isSymbol("+")) {
      // Unary plus.
      this.expectSymbol("+");

      // Nothing to wrap sub-expression with.
      node = this.parseUnaryExpression(symbolTable);
    } else if (token.isReserved("not")) {
      // Logical not.
      this.expectReservedWord("not");

      var expression = this.parseUnaryExpression(symbolTable);

      node = new Node(Node.NOT, token, {
        expression: expression
      }).withExpressionTypeFrom(expression);
    } else {
      node = this.parsePrimaryExpression(symbolTable);
    }

    return node;
  };

  this.parsePrimaryExpression = function(symbolTable) {
    var token = this.scanner.lookAhead();
    var node;

    if (token.tokenType === Token.TK_NUMBER) {
      token = this.scanner.next();
      node = new Node(Node.TK_NUMBER, token);
      var v = node.getNumber();
      var typeCode;
      if ((v | 0) === v) {
        typeCode = opcodes.I;
      } else {
        typeCode = opcodes.R;
      }
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: typeCode
      });
    } else if (token.tokenType === Token.TK_STRING) {
      token = this.scanner.next();
      node = new Node(Node.TK_STRING, token);
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: opcodes.S
      });
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      node = this.parseVariable(symbolTable);
      if (node.nodeType === Node.IDENTIFIER) {
        var nextToken = this.scanner.lookAhead();
        var symbolLookup;
        if (nextToken.isSymbol("(")) {
          symbolLookup = symbolTable.getSymbol(node.token, Node.SUBPROGRAM_TYPE);
        } else {
          symbolLookup = symbolTable.getSymbol(node.token);
        }
        var symbol = symbolLookup.symbol;
        node.symbolLookup = symbolLookup;

        if (symbol.type.nodeType === Node.SUBPROGRAM_TYPE) {

          node = new Node(Node.FUNCTION_CALL, node.token, {
            name: node,
            argumentList: this.parseArguments(symbolTable, symbol.type)
          });
          node.expressionType = symbol.type.returnType;
          if (symbol.name.toLowerCase() === "random" &&
            symbol.isNative &&
            node.argumentList.length > 0) {
            node.expressionType = Node.integerType;
          }
          if (symbol.name.toLowerCase() === "abs" &&
            symbol.isNative &&
            node.argumentList.length === 1 &&
            node.argumentList[0].nodeType === Node.CAST) {

            node.expressionType = node.argumentList[0].expression.expressionType;
          }
        } else {
          if (symbol.value !== null) {
            node = symbol.value;
          } else {
            node.expressionType = symbol.type;
          }
        }
      }
    } else if (token.isSymbol("(")) {
      // Parenthesized expression.
      this.expectSymbol("(");
      node = this._parseExpression(symbolTable);
      this.expectSymbol(")");
    } else if (token.isSymbol("@")) {

      this.expectSymbol("@");
      var variable = this.parseVariable(symbolTable);
      node = new Node(Node.ADDRESS_OF, token, {
        variable: variable
      });
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: opcodes.A,
        typeName: "AD-HOC",
        type: variable.expressionType
      });
    }

    return node;
  };

  this.parseArrayDereference = function(symbolTable, variable) {

    var arrayToken = this.expectSymbol("[");
    var indices = [];
    do {
      indices.push(this._parseExpression(symbolTable).castToType(Node.integerType));
    } while (this.moreEntitiesToCome(",", "]"));
    this.expectSymbol("]");

    var array = new Node(Node.ARRAY, arrayToken, {
      variable: variable,
      indices: indices
    });
    array.expressionType = variable.expressionType.elementType;

    return array;
  };

  this.parseRecordDesignator = function(symbolTable, variable) {
    var recordType = variable.expressionType;

    var dotToken = this.expectSymbol(".", "expected a dot");
    var fieldToken = this.expectIdentifier("expected a field name");
    var field = recordType.getField(fieldToken);
    var node = new Node(Node.FIELD_DESIGNATOR, dotToken, {
      variable: variable,
      field: field
    });

    node.expressionType = field.type;

    return node;
  };

  this.createBinaryNode = function(symbolTable, token, node, nodeType, rhsFn, forceType) {

    if (token.tokenType === Token.TK_SYMBOL) {
      this.expectSymbol(token.tokenValue);
    } else {
      this.expectReservedWord(token.tokenValue);
    }

    var operand1 = node;
    var operand2 = rhsFn.apply(this, [symbolTable]);

    var expressionType;
    if (forceType) {
      expressionType = forceType;
    } else {
      expressionType = this.getCompatibleType(token,
        operand1.expressionType,
        operand2.expressionType);
    }

    // Cast the operands if necessary.
    node = new Node(nodeType, token, {
      lhs: operand1.castToType(expressionType),
      rhs: operand2.castToType(expressionType)
    }).withExpressionType(expressionType);

    return node;
  };

  this.getCompatibleType = function(token, type1, type2) {
    if (type1.nodeType === Node.SIMPLE_TYPE && type1.typeCode !== type2.typeCode) {

      if (type1.typeCode === opcodes.A || type2.typeCode === opcodes.A ||
        type1.typeCode === opcodes.B || type2.typeCode === opcodes.B ||
        type1.typeCode === opcodes.S || type2.typeCode === opcodes.S ||
        type1.typeCode === opcodes.T || type2.typeCode === opcodes.T ||
        type1.typeCode === opcodes.P || type2.typeCode === opcodes.P ||
        type1.typeCode === opcodes.X || type2.typeCode === opcodes.X) {

      }

      if (type1.typeCode === opcodes.R) {
        return type1;
      } else if (type2.typeCode === opcodes.R) {
        return type2;
      }

      if (type1.typeCode === opcodes.I) {
        return type1;
      } else if (type2.typeCode === opcodes.I) {
        return type2;
      }

    } else {
      // Return either type.
      return type1;
    }
  };
}

module.exports = Parser;
