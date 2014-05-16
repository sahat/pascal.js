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

  this.expectReservedWord = function() {
    return this.scanner.next();
  };

  this.expectSymbol = function() {
    return this.scanner.next();
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

    if (token.isReserved('var')) {
      this.expectReservedWord('var');
      return this.parseVarDeclaration(symbolTable);
    } else if (token.isReserved('procedure')) {
      return [this.parseSubprogramDeclaration(symbolTable, Node.PROCEDURE)];
    }
  };

  this.parseVarDeclaration = function(symbolTable) {
    var nodes = [];
    do {
      var startNode = nodes.length;
      do {
        var token = this.scanner.next();
        var node = new Node(Node.VAR, null, {
          name: new Node(Node.IDENTIFIER, token)
        });
        nodes.push(node);
      } while (this.moreEntitiesToCome(',', ':'));
      this.expectSymbol(':');
      var type = this.parseType(symbolTable);
      for (var i = startNode; i < nodes.length; i++) {
        nodes[i].type = type;
        nodes[i].symbol = symbolTable.addSymbol(
          nodes[i].name.token.tokenValue, Node.VAR, type);
      }
      this.expectSymbol(';');
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    return nodes;
  };

  this.parseTypeDeclaration = function(symbolTable) {
    var nodes = [];

    var incompleteTypes = [];

    do {
      var token = this.scanner.next();
      var identifierNode = new Node(Node.IDENTIFIER, token);
      var equalToken = this.expectSymbol('=');
      var type = this.parseType(symbolTable, incompleteTypes);

      var node = new Node(Node.TYPE, equalToken, {
        name: identifierNode,
        type: type
      });
      node.symbol = symbolTable.addType(identifierNode.token.tokenValue, type);
      nodes.push(node);
      this.expectSymbol(';');
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
    var nameToken = this.scanner.next();
    var symbolTable = new SymbolTable(symbolTable);
    var token = this.scanner.lookAhead();
    var parameters = [];
    var returnType;

    if (token.isSymbol('(')) {
      this.expectSymbol('(');
      var start = 0;
      do {
        do {
          token = this.scanner.next();
          parameters.push(new Node(Node.PARAMETER, colon, {
            name: new Node(Node.IDENTIFIER, token)
          }));
        } while (this.moreEntitiesToCome(',', ':'));
        var colon = this.expectSymbol(':');
        var type = this.parseType(symbolTable);
        for (var i = start; i < parameters.length; i++) {
          parameters[i].type = type;
        }
        start = parameters.length;
      } while (this.moreEntitiesToCome(';', ')'));

      this.expectSymbol(')');
    }

    for (var i = 0; i < parameters.length; i++) {
      var parameter = parameters[i];
      var symbol = symbolTable.addSymbol(parameter.name.token.tokenValue, Node.PARAMETER,
        parameter.type);
    }


    this.expectSymbol(';');

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
    this.expectSymbol(nodeType === Node.PROGRAM ? '.' : ';');

    return node;
  };

  this.parseBlock = function(symbolTable, startWord, endWord) {
    var token = this.expectReservedWord(startWord);
    var statements = [];
    var reachedEnd = false;
    while (!reachedEnd) {
      token = this.scanner.lookAhead();
      if (token.isReserved(endWord)) {
        this.scanner.next();
        reachedEnd = true;
      } else if (token.isSymbol(';')) {
        this.scanner.next();
      } else {
        statements.push(this.parseStatement(symbolTable));
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
    } else if (token.isReserved('for')) {
      node = this.parseForStatement(symbolTable);
    } else if (token.isReserved('begin')) {
      node = this.parseBlock(symbolTable, 'begin', 'end');
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
    var identifierToken = this.scanner.next();
    var node = new Node(Node.IDENTIFIER, identifierToken);
    var symbolLookup = symbolTable.getSymbol(identifierToken);
    node.symbolLookup = symbolLookup;
    node.expressionType = symbolLookup.symbol.type;
    return node;
  };

  this.parseAssignment = function(symbolTable, variable) {
    var assignToken = this.expectSymbol(':=');
    var expression = this.parseExpression(symbolTable);
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
      if (symbol.name.toLowerCase() === 'new' && symbol.isNative) {
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

    if (this.scanner.lookAhead().isSymbol('(')) {
      this.expectSymbol('(');
      var token = this.scanner.lookAhead();
      if (token.isSymbol(')')) {
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
            argument = this.parseExpression(symbolTable);
          }
          if (parameter) {
            argument = argument.castToType(parameter.type);
          }
          argumentList.push(argument);
        } while (this.moreEntitiesToCome(',', ')'));
        this.expectSymbol(')');
      }
    }

    return argumentList;
  };

  this.parseIfStatement = function(symbolTable) {
    var token = this.expectReservedWord('if');
    var expression = this.parseExpression(symbolTable);
    this.expectReservedWord('then');
    var thenStatement = this.parseStatement(symbolTable);
    var elseStatement = null;
    var elseToken = this.scanner.lookAhead();
    if (elseToken.isReserved('else')) {
      this.expectReservedWord('else');
      elseStatement = this.parseStatement(symbolTable);
    }

    return new Node(Node.IF, token, {
      expression: expression,
      thenStatement: thenStatement,
      elseStatement: elseStatement
    });
  };



  this.parseForStatement = function(symbolTable) {
    var token = this.expectReservedWord('for');

    var loopVariableToken = this.scanner.next();
    this.expectSymbol(':=');
    var fromExpr = this.parseExpression(symbolTable);
    var downto = this.scanner.lookAhead().isReserved('downto');
    if (downto) {
      this.expectReservedWord('downto');
    } else {
      this.expectReservedWord('to');
    }
    var toExpr = this.parseExpression(symbolTable);
    this.expectReservedWord('do');
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

  this.parseType = function(symbolTable) {
    var token = this.scanner.next();
    var symbolLookup = symbolTable.getType(token);
    var node = symbolLookup.symbol.type;
    return node;
  };

  this.parseExpression = function(symbolTable) {
    return this.parseRelationExpression(symbolTable);
  };

  this.parseRelationExpression = function(symbolTable) {
    var node = this.parseAddExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol('=')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.EQUALITY,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol('<>')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.INEQUALITY,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol('>')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.GREATER_THAN,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol('<')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.LESS_THAN,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol('>=')) {
        node = this.createBinaryNode(symbolTable, token, node,
          Node.GREATER_OR_EQUAL_TO,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol('<=')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.LESS_OR_EQUAL_TO,
          this.parseAddExpression).withExpressionType(Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseAddExpression = function(symbolTable) {
    var node = this.parseMultiplyExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol('+')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.ADDITION,
          this.parseMultiplyExpression);
      } else if (token.isSymbol('-')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.SUBTRACTION,
          this.parseMultiplyExpression);
      } else if (token.isReserved('or')) {
        node = this.createBinaryNode(symbolTable, token, node, Node.OR,
          this.parseMultiplyExpression,
          Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseMultiplyExpression = function(symbolTable) {
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
    var token = this.scanner.lookAhead();
    if (token.isSymbol('-')) {
      var expression = this.parseUnaryExpression(symbolTable);
      node = new Node(Node.NEGATIVE, token, {
        expression: expression
      });
    } else if (token.isSymbol('+')) {
      node = this.parseUnaryExpression(symbolTable);
    } else if (token.isReserved('not')) {
      this.expectReservedWord('not');
      var expression = this.parseUnaryExpression(symbolTable);
      node = new Node(Node.NOT, token, {
        expression: expression
      });
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
      node = new Node(Node.NUMBER, token);
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
      node = new Node(Node.STRING, token);
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: opcodes.S
      });
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      node = this.parseVariable(symbolTable);
    } else if (token.isSymbol('(')) {
      this.expectSymbol('(');
      node = this.parseExpression(symbolTable);
      this.expectSymbol(')');
    }

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
