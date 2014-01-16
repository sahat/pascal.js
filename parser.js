var OPCODES = require('./opcodes');
var Node = require('./node');
var Token = require('./Token');
var SymbolTable = require('./symbol_table');
var PascalError = require('./pascal_error');

function Parser(scanner) {
  this.scanner = scanner;

  this.parse = function(symbolTable) {
    var node = this.parseSubprogramDeclaration(symbolTable, Node.PROGRAM);
    return node;
  };

  this.moreEntitiesToCome = function (separator, terminator) {
    var token = this.scanner.lookAhead();
    if (token.isSymbol(separator)) {
      // More to come. Eat the separator.
      this.scanner.next();
      return true;
    } else if (token.isSymbol(terminator)) {
      // We're done. Leave the terminator.
      return false;
    } else {
      throw new PascalError(token, "expected \"" + separator +
        "\" or \"" + terminator + "\"");
    }
  };

  this.expectReservedWord = function (reservedWord, message) {
    var token = this.scanner.next();
    message = message || ("expected reserved word \"" + reservedWord + "\"");
    if (!token.isReserved(reservedWord)) {
      throw new PascalError(token, message);
    }
    return token;
  };

  this.expectSymbol = function (symbol, message) {
    var token = this.scanner.next();
    if (token.tokenType !== Token.TK_SYMBOL || token.tokenValue !== symbol) {
      message = message || ("expected symbol \"" + symbol + "\"");
      throw new PascalError(token, message);
    }
    return token;
  };

  this.expectIdentifier = function (message) {
    var token = this.scanner.next();
    if (token.tokenType !== Token.TK_IDENTIFIER) {
      throw new PascalError(token, message);
    }
    return token;
  };

  this.parseDeclarations = function (symbolTable) {
    var declarations = [];

    // Parse each declaration or block.
    while (!this.scanner.lookAhead().isReserved("begin")) {
      // This parser also eats the semicolon after the declaration.
      var nodes = this.parseDeclaration(symbolTable);

      // Extend the declarations array with the nodes array.
      declarations.push.apply(declarations, nodes);
    }

    return declarations;
  }

  this.parseDeclaration = function (symbolTable) {
    var token = this.scanner.lookAhead();

    if (token.isReserved("uses")) {
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
    } else if (token.tokenType === Token.TK_EOF) {
      throw new PascalError(token, "unexpected end of file");
    } else {
      throw new PascalError(token, "unexpected token");
    }
  };

  this.parseUsesDeclaration = function (symbolTable) {
    var usesToken = this.expectReservedWord("uses");

    var nodes = [];

    do {
      var token = this.expectIdentifier("expected module name");
      var node = new Node(Node.USES, usesToken, {
        name: new Node(Node.IDENTIFIER, token)
      });
      console.log(token.tokenValue);

      // Import the module's symbols into this symbol table.
      //modules.importModule(token.tokenValue, symbolTable);

      nodes.push(node);
    } while (this.moreEntitiesToCome(",", ";"));

    this.expectSymbol(";");

    return nodes;
  };

  this.parseVarDeclaration = function (symbolTable) {
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

      // Skip colon.
      this.expectSymbol(":");

      // Parse the variable's type.
      var type = this._parseType(symbolTable);

      // Set the type of all nodes for this line.
      for (var i = startNode; i < nodes.length; i++) {
        nodes[i].type = type;

        // Add the variable to our own symbol table.
        nodes[i].symbol = symbolTable.addSymbol(
          nodes[i].name.token.tokenValue, Node.VAR, type);
      }

      // We always finish the line with a semicolon.
      this.expectSymbol(";");

      // If the next token is an identifier, then we keep going.
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    return nodes;
  };

  this.parseConstDeclaration = function (symbolTable) {
    var nodes = [];

    do {
      // Parse the constant name.
      var token = this.expectIdentifier("expected constant name");
      var identifierNode = new Node(Node.IDENTIFIER, token);

      // Parse optional type.
      var type = null;
      token = this.scanner.lookAhead();
      if (token.isSymbol(":")) {
        this.scanner.next();
        type = this._parseType(symbolTable);
      }

      // Parse value. How we do this depends on whether it's a typed constant,
      // and if it is, what kind.
      this.expectSymbol("=");

      // Create the node.
      var node;
      if (type === null) {
        // Constant.
        var expression = this._parseExpression(symbolTable);
        node = new Node(Node.CONST, null, {
          name: identifierNode,
          type: expression.expressionType,
          value: expression
        });
      } else {
        // Typed constant.
        var rawData;

        // XXX We need to verify type compatibility throughout here.
        if (type.nodeType === Node.ARRAY_TYPE) {
          rawData = this.parseArrayConstant(symbolTable, type);
        } else if (type.nodeType === Node.RECORD_TYPE) {
          throw new PascalError(token, "constant records not supported");
        } else if (type.nodeType === Node.SIMPLE_TYPE) {
          rawData = new RawData();
          rawData.addNode(this._parseExpression(symbolTable));
        } else {
          throw new PascalError(token, "unhandled typed constant type " + type.nodeType);
        }

        node = new Node(Node.TYPED_CONST, null, {
          name: identifierNode,
          type: type,
          rawData: rawData
        });
      }

      // Add the constant to our own symbol table.
      node.symbol = symbolTable.addSymbol(identifierNode.token.tokenValue,
        node.nodeType, node.type);
      if (type === null) {
        node.symbol.value = node.value;
      }
      nodes.push(node);

      // Semicolon terminator.
      this.expectSymbol(";");
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    return nodes;
  };

  this.parseArrayConstant = function (symbolTable, type) {
    // The raw linear (in-memory) version of the data.
    var rawData = new RawData();

    // Recursive function to parse a dimension of the array. The first
    // dimension (ranges[0]) is the "major" one, and we recurse until
    // the last dimension, where we actually parse the constant
    // expressions.
    var self = this;
    var parseDimension = function (d) {
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

    // Start the recursion.
    parseDimension(0);

    return rawData;
  };

  this.parseTypeDeclaration = function (symbolTable) {
    var nodes = [];

    // Pointer types are permitted to point to an undefined type name, as long as
    // that name is defined by the end of the "type" section. We keep track of these
    // here and resolve them at the end.
    var incompleteTypes = [];

    do {
      // Parse identifier.
      var token = this.expectIdentifier("expected type name");
      var identifierNode = new Node(Node.IDENTIFIER, token);

      // Required equal sign.
      var equalToken = this.expectSymbol("=");

      // Parse type.
      var type = this._parseType(symbolTable, incompleteTypes);

      // Create the node.
      var node = new Node(Node.TYPE, equalToken, {
        name: identifierNode,
        type: type
      });

      // Add the type to our own symbol table.
      node.symbol = symbolTable.addType(identifierNode.token.tokenValue, type);
      nodes.push(node);

      // Semicolon terminator.
      this.expectSymbol(";");
    } while (this.scanner.lookAhead().tokenType === Token.TK_IDENTIFIER);

    // Fill in incomplete types. They're required to be defined by the end of
    // the "type" block.
    for (var i = 0; i < incompleteTypes.length; i++) {
      var node = incompleteTypes[i];

      node.type = symbolTable.getType(node.typeName.token).symbol.type;
    }

    return nodes;
  };

  this.parseSubprogramDeclaration = function (symbolTable, nodeType) {
    // Get the string like "procedure", etc.
    var declType = Node.nodeLabel[nodeType];

    // Parse the opening token.
    var procedureToken = this.expectReservedWord(declType);

    // Parse the name.
    var nameToken = this.expectIdentifier("expected " + declType + " name");

    // From now on we're in our own table.
    var symbolTable = new SymbolTable(symbolTable);

    // Parse the parameters.
    var token = this.scanner.lookAhead();
    var parameters = [];
    if (token.isSymbol("(")) {
      this.expectSymbol("(");

      var start = 0;
      do {
        var byReference = false;

        // See if we're passing this batch by reference.
        if (this.scanner.lookAhead().isReserved("var")) {
          this.expectReservedWord("var");
          byReference = true;
        }

        // Parameters can be batched by type.
        do {
          token = this.expectIdentifier("expected parameter name");
          parameters.push(new Node(Node.PARAMETER, colon, {
            name: new Node(Node.IDENTIFIER, token),
            byReference: byReference
          }));
        } while (this.moreEntitiesToCome(",", ":"));
        var colon = this.expectSymbol(":");

        // Add the type to each parameter.
        var type = this._parseType(symbolTable);
        for (var i = start; i < parameters.length; i++) {
          parameters[i].type = type;
        }
        start = parameters.length;
      } while (this.moreEntitiesToCome(";", ")"));

      this.expectSymbol(")");
    }

    // Add parameters to our own symbol table.
    for (var i = 0; i < parameters.length; i++) {
      var parameter = parameters[i];
      var symbol = symbolTable.addSymbol(parameter.name.token.tokenValue, Node.PARAMETER,
        parameter.type, parameter.byReference);
    }

    // Parse the return type if it's a function.
    var returnType;
    if (nodeType === Node.FUNCTION) {
      this.expectSymbol(":");
      returnType = this._parseType(symbolTable);
    } else {
      returnType = Node.voidType;
    }
    this.expectSymbol(";");

    // Functions have an additional fake symbol: their own name, which maps
    // to the mark pointer location (return value).
    if (nodeType === Node.FUNCTION) {
      var name = nameToken.tokenValue;
      symbolTable.symbols[name.toLowerCase()] = new Symbol(name, returnType, 0, false);
    }

    // Create the type of the subprogram itself.
    var type = new Node(Node.SUBPROGRAM_TYPE, procedureToken, {
      parameters: parameters,
      returnType: returnType
    });

    // Add the procedure to our parent symbol table.
    var symbol = symbolTable.parentSymbolTable.addSymbol(nameToken.tokenValue,
      Node.SUBPROGRAM_TYPE, type);

    // Parse declarations.
    var declarations = this.parseDeclarations(symbolTable);

    // Parse begin/end block.
    var block = this.parseBlock(symbolTable, "begin", "end");

    // Make node.
    var node = new Node(nodeType, procedureToken, {
      name: new Node(Node.IDENTIFIER, nameToken),
      declarations: declarations,
      block: block
    });
    node.symbol = symbol;
    node.symbolTable = symbolTable;
    node.expressionType = type;

    // Semicolon terminator.
    this.expectSymbol(nodeType === Node.PROGRAM ? "." : ";");

    return node;
  };

  this.parseBlock = function (symbolTable, startWord, endWord) {
    var token = this.expectReservedWord(startWord);
    var statements = [];

    var foundEnd = false;
    while (!foundEnd) {
      token = this.scanner.lookAhead();
      if (token.isReserved(endWord)) {
        // End of block.
        this.scanner.next();
        foundEnd = true;
      } else if (token.isSymbol(";")) {
        // Empty statement.
        this.scanner.next();
      } else {
        // Parse statement.
        statements.push(this.parseStatement(symbolTable));

        // After an actual statement, we require a semicolon or end of block.
        token = this.scanner.lookAhead();
        if (!token.isReserved(endWord) && !token.isSymbol(";")) {
          throw new PascalError(token, "expected \";\" or \"" + endWord + "\"");
        }
      }
    }

    return new Node(Node.BLOCK, token, {
      statements: statements
    });
  };

  this.parseStatement = function (symbolTable) {
    var token = this.scanner.lookAhead();
    var node;

    // Handle simple constructs.
    if (token.isReserved("if")) {
      node = this.parseIfStatement(symbolTable);
    } else if (token.isReserved("while")) {
      node = this.parseWhileStatement(symbolTable);
    } else if (token.isReserved("repeat")) {
      node = this.parseRepeatStatement(symbolTable);
    } else if (token.isReserved("for")) {
      node = this.parseForStatement(symbolTable);
    } else if (token.isReserved("begin")) {
      node = this.parseBlock(symbolTable, "begin", "end");
    } else if (token.isReserved("exit")) {
      node = this.parseExitStatement(symbolTable);
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      // This could be an assignment or procedure call. Both start with an identifier.
      node = this.parseVariable(symbolTable);

      // See if this is an assignment or procedure call.
      token = this.scanner.lookAhead();
      if (token.isSymbol(":=")) {
        // It's an assignment.
        node = this.parseAssignment(symbolTable, node);
      } else if (node.nodeType === Node.IDENTIFIER) {
        // Must be a procedure call.
        node = this._parseProcedureCall(symbolTable, node);
      } else {
        throw new PascalError(token, "invalid statement");
      }
    } else {
      throw new PascalError(token, "invalid statement");
    }

    return node;
  };

  this.parseVariable = function (symbolTable) {
    // Variables always start with an identifier.
    var identifierToken = this.expectIdentifier("expected identifier");

    // Create an identifier node for this token.
    var node = new Node(Node.IDENTIFIER, identifierToken);

    // Look up the symbol so we can set its type.
    var symbolLookup = symbolTable.getSymbol(identifierToken);
    node.symbolLookup = symbolLookup;
    node.expressionType = symbolLookup.symbol.type;

    // The next token determines whether the variable continues or ends here.
    while (true) {
      var nextToken = this.scanner.lookAhead();
      if (nextToken.isSymbol("[")) {
        // Replace the node with an array node.
        node = this.parseArrayDereference(symbolTable, node);
      } else if (nextToken.isSymbol(".")) {
        // Replace the node with a record designator node.
        node = this.parseRecordDesignator(symbolTable, node);
      } else if (nextToken.isSymbol("^")) {
        // Replace the node with a pointer dereference.
        this.expectSymbol("^");
        var variable = node;
        if (!variable.expressionType.isSimpleType(OPCODES.A)) {
          throw new PascalError(nextToken, "can only dereference pointers");
        }
        node = new Node(Node.DEREFERENCE, nextToken, {
          variable: node
        });
        node.expressionType = variable.expressionType.type;
      } else {
        // We're done with the variable.
        break;
      }
    }

    return node;
  };

  this.parseAssignment = function (symbolTable, variable) {
    var assignToken = this.expectSymbol(":=");

    var expression = this._parseExpression(symbolTable);
    return new Node(Node.ASSIGNMENT, assignToken, {
      lhs: variable,
      rhs: expression.castToType(variable.expressionType)
    });
  };

  this._parseProcedureCall = function (symbolTable, identifier) {
    // Look up the symbol to make sure it's a procedure.
    var symbolLookup = symbolTable.getSymbol(identifier.token);
    var symbol = symbolLookup.symbol;
    identifier.symbolLookup = symbolLookup;

    // Verify that it's a procedure.
    if (symbol.type.nodeType === Node.SUBPROGRAM_TYPE && symbol.type.returnType.isVoidType()) {
      // Parse optional arguments.
      var argumentList = this.parseArguments(symbolTable, symbol.type);

      // If the call is to the native function "New", then we pass a hidden second
      // parameter, the size of the object to allocate. The procedure needs that
      // to know how much to allocate.
      if (symbol.name.toLowerCase() === "new" && symbol.isNative) {
        if (argumentList.length === 1) {
          argumentList.push(Node.makeNumberNode(
            argumentList[0].expressionType.type.getTypeSize()));
        } else {
          throw new PascalError(identifier.token, "new() takes one argument");
        }
      }

      return new Node(Node.PROCEDURE_CALL, identifier.token, {
        name: identifier,
        argumentList: argumentList
      });
    } else {
      throw new PascalError(identifier.token, "expected procedure");
    }
  };

  this.parseArguments = function (symbolTable, type) {
    var argumentList = [];

    if (this.scanner.lookAhead().isSymbol("(")) {
      this.expectSymbol("(");
      var token = this.scanner.lookAhead();
      if (token.isSymbol(")")) {
        // Empty arguments.
        this.scanner.next();
      } else {
        do {
          // Find the formal parameter. Some functions (like WriteLn)
          // are variadic, so allow them to have more arguments than
          // were defined.
          var argumentIndex = argumentList.length;
          var parameter;
          if (argumentIndex < type.parameters.length) {
            parameter = type.parameters[argumentIndex];
          } else {
            // Accept anything (by value).
            parameter = null;
          }

          var argument;
          if (parameter && parameter.byReference) {
            // This has to be a variable, not any expression, since
            // we need its address.
            argument = this.parseVariable(symbolTable);

            // Hack this "byReference" field that'll be used by
            // the compiler to pass the argument's address.
            argument.byReference = true;
          } else {
            argument = this._parseExpression(symbolTable);
          }

          // Cast to type of parameter.
          if (parameter) {
            argument = argument.castToType(parameter.type);
          }

          argumentList.push(argument);
        } while (this.moreEntitiesToCome(",", ")"));
        this.expectSymbol(")");
      }
    }

    return argumentList;
  };

  this.parseIfStatement = function (symbolTable) {
    var token = this.expectReservedWord("if");

    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(expression.token, "if condition must be a boolean");
    }

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

  this.parseWhileStatement = function (symbolTable) {
    var whileToken = this.expectReservedWord("while");

    // Parse the expression that keeps the loop going.
    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(whileToken, "while condition must be a boolean");
    }

    // The "do" keyword is required.
    this.expectReservedWord("do", "expected \"do\" for \"while\" loop");

    // Parse the statement. This can be a begin/end pair.
    var statement = this.parseStatement(symbolTable);

    // Create the node.
    return new Node(Node.WHILE, whileToken, {
      expression: expression,
      statement: statement
    });
  };

  this.parseRepeatStatement = function (symbolTable) {
    var block = this.parseBlock(symbolTable, "repeat", "until");
    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(node.token, "repeat condition must be a boolean");
    }

    return new Node(Node.REPEAT, block.token, {
      block: block,
      expression: expression
    });
  };

  this.parseForStatement = function (symbolTable) {
    var token = this.expectReservedWord("for");

    var loopVariableToken = this.expectIdentifier("expected identifier for \"for\" loop");
    this.expectSymbol(":=");
    var fromExpr = this._parseExpression(symbolTable);
    var downto = this.scanner.lookAhead().isReserved("downto");
    if (downto) {
      this.expectReservedWord("downto");
    } else {
      // Default error message if it's neither.
      this.expectReservedWord("to");
    }
    var toExpr = this._parseExpression(symbolTable);
    this.expectReservedWord("do");
    var body = this.parseStatement(symbolTable);

    // Get the symbol for the loop variable.
    var symbolLookup = symbolTable.getSymbol(loopVariableToken);
    var loopVariableType = symbolLookup.symbol.type;
    var variable = new Node(Node.IDENTIFIER, loopVariableToken);
    variable.symbolLookup = symbolLookup;

    // Cast "from" and "to" to type of variable.
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

  this.parseExitStatement = function (symbolTable) {
    var token = this.expectReservedWord("exit");

    return new Node(Node.EXIT, token);
  };

 this._parseType = function (symbolTable, incompleteTypes) {
   var token = this.scanner.next();
   var node;

   if (token.isReserved("array")) {
     // Array type.
     this.expectSymbol("[");
     var ranges = [];
     // Parse multiple ranges.
     do {
       var range = this.parseRange(symbolTable);
       ranges.push(range);
     } while (this.moreEntitiesToCome(",", "]"));
     this.expectSymbol("]");
     this.expectReservedWord("of");
     var elementType = this._parseType(symbolTable, incompleteTypes);

     node = new Node(Node.ARRAY_TYPE, token, {
       elementType: elementType,
       ranges: ranges
     });
   } else if (token.isReserved("record")) {
     node = this.parseRecordType(symbolTable, token, incompleteTypes);
   } else if (token.isSymbol("^")) {
     var typeNameToken = this.expectIdentifier("expected type identifier");
     var type;
     try {
       type = symbolTable.getType(typeNameToken).symbol.type;
     } catch (e) {
       if (e instanceof PascalError) {
         // The type symbol is not defined. Pascal requires that it be defined
         // by the time the "type" section ends.
         type = null;
       } else {
         throw new PascalError(typeNameToken, "exception looking up type symbol");
       }
     }
     node = new Node(Node.SIMPLE_TYPE, token, {
       typeCode: OPCODES.A,
       typeName: new Node(Node.IDENTIFIER, typeNameToken),
       type: type
     });
     // See if this is a forward type reference.
     if (type === null) {
       // We'll fill these in later.
       if (incompleteTypes) {
         incompleteTypes.push(node);
       } else {
         throw new PascalError(typeNameToken, "unknown type");
       }
     }
   } else if (token.tokenType === Token.TK_IDENTIFIER) {
     // Type name.
     var symbolLookup = symbolTable.getType(token);

     // Substitute the type right away. This will mess up the display of
     // the program, since you'll see the full type everywhere, but will
     // simplify the compilation step.
     node = symbolLookup.symbol.type;
   } else {
     throw new PascalError(token, "can't parse type");
   }

   // A type node is its own type.
   node.expressionType = node;

   return node;
 };

  this.parseRecordType = function (symbolTable, token, incompleteTypes) {
    // A record is a list of fields.
    var fields = [];

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol(";")) {
        // Empty field, no problem.
        this.scanner.next();
      } else if (token.isReserved("end")) {
        // End of record.
        this.expectReservedWord("end");
        break;
      } else {
        fields.push.apply(fields,
          this._parseRecordSection(symbolTable, token, incompleteTypes));
        // Must have ";" or "end" after field.
        var token = this.scanner.lookAhead();
        if (!token.isSymbol(";") && !token.isReserved("end")) {
          throw new PascalError(token, "expected \";\" or \"end\" after field");
        }
      }
    }

    // Calculate the offset of each field.
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

  this._parseRecordSection = function (symbolTable, fieldToken, incompleteTypes) {
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

  this.parseRange = function (symbolTable) {
    var low = this._parseExpression(symbolTable);
    var token = this.expectSymbol("..");
    var high = this._parseExpression(symbolTable);

    return new Node(Node.RANGE, token, {low: low, high: high});
  };

  this._parseExpression = function (symbolTable) {
    return this._parseRelationalExpression(symbolTable);
  };

  this._parseRelationalExpression = function (symbolTable) {
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

  this.parseAdditiveExpression = function (symbolTable) {
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

  this.parseMultiplicativeExpression = function (symbolTable) {
    var node = this.parseUnaryExpression(symbolTable);

    while (true) {
      var token = this.scanner.lookAhead();
      if (token.isSymbol("*")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.MULTIPLICATION,
          this.parseUnaryExpression);
      } else if (token.isSymbol("/")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.DIVISION,
          this.parseUnaryExpression, Node.realType);
      } else if (token.isReserved("div")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.INTEGER_DIVISION,
          this.parseUnaryExpression, Node.integerType);
      } else if (token.isReserved("mod")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.MOD,
          this.parseUnaryExpression, Node.integerType);
      } else if (token.isReserved("and")) {
        node = this.createBinaryNode(symbolTable, token, node, Node.AND,
          this.parseUnaryExpression, Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  this.parseUnaryExpression = function (symbolTable) {
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
      if (!expression.expressionType.isBooleanType()) {
        throw new PascalError(expression.token, "not operand must be a boolean");
      }
      node = new Node(Node.NOT, token, {
        expression:expression
      }).withExpressionTypeFrom(expression);
    } else {
      node = this.parsePrimaryExpression(symbolTable);
    }

    return node;
  };

  this.parsePrimaryExpression = function (symbolTable) {
    var token = this.scanner.lookAhead();
    var node;

    if (token.tokenType === Token.TK_NUMBER) {
      // Numeric literal.
      token = this.scanner.next();
      node = new Node(Node.TK_NUMBER, token);
      var v = node.getNumber();
      var typeCode;

      // See if we're an integer or real.
      if ((v | 0) === v) {
        typeCode = OPCODES.I;
      } else {
        typeCode = OPCODES.R;
      }

      // Set the type based on the kind of number we have. Really we should
      // have the scanner tell us, because JavaScript treats "2.0" the same as "2".
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: typeCode
      });
    } else if (token.tokenType === Token.TK_STRING) {
      // String literal.
      token = this.scanner.next();
      node = new Node(Node.TK_STRING, token);
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: OPCODES.S
      });
    } else if (token.tokenType === Token.TK_IDENTIFIER) {
      // Parse a variable (identifier, array dereference, etc.).
      node = this.parseVariable(symbolTable);

      // What we do next depends on the variable. If it's just an identifier,
      // then it could be a function call, a function call with arguments,
      // a constant, or a plain variable. We handle all these cases. If it's
      // not just an identifier, then we leave it alone.
      if (node.nodeType === Node.IDENTIFIER) {
        // Peek to see if we've got parentheses.
        var nextToken = this.scanner.lookAhead();

        // Look up the symbol.
        var symbolLookup;
        if (nextToken.isSymbol("(")) {
          // This is a hack to allow recursion. I don't know how a real Pascal
          // parser might distinguish between a function and an identifier. Do
          // we first check the parenthesis or first check the symbol type?
          symbolLookup = symbolTable.getSymbol(node.token, Node.SUBPROGRAM_TYPE);
        } else {
          symbolLookup = symbolTable.getSymbol(node.token);
        }
        var symbol = symbolLookup.symbol;
        node.symbolLookup = symbolLookup;

        if (symbol.type.nodeType === Node.SUBPROGRAM_TYPE) {
          // We're calling a function. Make sure it's not a procedure.
          if (symbol.type.returnType.isVoidType()) {
            throw new PascalError(node.token, "can't call procedure in expression");
          }

          // Make the function call node with the optional arguments.
          node = new Node(Node.FUNCTION_CALL, node.token, {
            name: node,
            argumentList: this.parseArguments(symbolTable, symbol.type)
          });

          // Type of the function call is the return type of the function.
          node.expressionType = symbol.type.returnType;

          // We have to hack the call to Random() because its return
          // type depends on whether it takes a parameter or not.
          // We detect that we're calling the built-in one and modify
          // the return type to be an Integer if it takes a parameter.
          if (symbol.name.toLowerCase() === "random" &&
            symbol.isNative &&
            node.argumentList.length > 0) {

            // Return Integer.
            node.expressionType = Node.integerType;
          }

          // Hack Abs() because its return type is the same as its parameter.
          // If the parameter was an integer, then it's already been cast
          // to a real in the argument parsing.
          if (symbol.name.toLowerCase() === "abs" &&
            symbol.isNative &&
            node.argumentList.length === 1 &&
            node.argumentList[0].nodeType === Node.CAST) {

            node.expressionType = node.argumentList[0].expression.expressionType;
          }
        } else {
          // This is just a symbol. Check to see if it's a constant. If it is,
          // replace it with the value.
          if (symbol.value !== null) {
            // Only for simple types.
            node = symbol.value;
          } else {
            // Normal variable. Look up its type.
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
      // This doesn't work. It's not clear what the type of the resulting
      // expression is. It should be a pointer to a (say) integer, but
      // a pointer type requires a typeName, which we don't have and might
      // not have at all. If this variable is declared as being of type
      // record, then there's no name to use. And even if it uses a formal
      // type definition, we lose than when we look up the type of the variable.
      // None of our code uses this expression, so we're not going to support
      // it.
      throw new PascalError(token, "the @ operator is not supported");

      this.expectSymbol("@");
      var variable = this.parseVariable(symbolTable);
      node = new Node(Node.ADDRESS_OF, token, {
        variable: variable
      });
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: OPCODES.A,
        typeName: "AD-HOC",
        type: variable.expressionType
      });
    } else {
      throw new PascalError(token, "expected expression");
    }

    return node;
  };

  this.parseArrayDereference = function (symbolTable, variable) {
    // Make sure the variable is an array.
    if (variable.expressionType.nodeType !== Node.ARRAY_TYPE) {
      throw new PascalError(variable.token, "expected an array type");
    }

    var arrayToken = this.expectSymbol("[");
    var indices = [];
    do {
      // Indices must be integers.
      indices.push(this._parseExpression(symbolTable).castToType(Node.integerType));
    } while (this.moreEntitiesToCome(",", "]"));
    this.expectSymbol("]");

    var array = new Node(Node.ARRAY, arrayToken, {
      variable: variable,
      indices: indices
    });

    // The type of the array lookup is the type of the array element.
    array.expressionType = variable.expressionType.elementType;

    return array;
  };

  this.parseRecordDesignator = function (symbolTable, variable) {
    // Make sure the variable so far is a record.
    var recordType = variable.expressionType;
    if (recordType.nodeType !== Node.RECORD_TYPE) {
      throw new PascalError(nextToken, "expected a record type");
    }

    var dotToken = this.expectSymbol(".", "expected a dot");

    // Parse the field name.
    var fieldToken = this.expectIdentifier("expected a field name");

    // Get the field for this identifier.
    var field = recordType.getField(fieldToken);

    // Create the new node.
    var node = new Node(Node.FIELD_DESIGNATOR, dotToken, {
      variable: variable,
      field: field
    });

    // Type of designation is the type of the field.
    node.expressionType = field.type;

    return node;
  };

  this.createBinaryNode = function (symbolTable, token, node,
                                    nodeType, rhsFn, forceType) {

    // It must be next, we've only peeked at it.
    if (token.tokenType === Token.TK_SYMBOL) {
      this.expectSymbol(token.tokenValue);
    } else {
      this.expectReservedWord(token.tokenValue);
    }

    var operand1 = node;
    var operand2 = rhsFn.apply(this, [symbolTable]);

    var expressionType;
    if (forceType) {
      // Use what's passed in.
      expressionType = forceType;
    } else {
      // Figure it out from the operands.
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

  this.getCompatibleType = function (token, type1, type2) {
    // Must have them defined.
    if (!type1) {
      throw new PascalError(token, "can't find compatible types for type1=null");
    }
    if (!type2) {
      throw new PascalError(token, "can't find compatible types for type2=null");
    }

    // Must be the same type of node. Can't cast between node types
    // (e.g., array to set).
    if (type1.nodeType !== type2.nodeType) {
      throw new PascalError(token, "basic types are incompatible");
    }

    // Can cast between some simple types.
    if (type1.nodeType === Node.SIMPLE_TYPE &&
      type1.typeCode !== type2.typeCode) {

      // They're different.
      var typeCode1 = type1.typeCode;
      var typeCode2 = type2.typeCode;

      if (typeCode1 === OPCODES.A || typeCode2 === OPCODES.A ||
        typeCode1 === OPCODES.B || typeCode2 === OPCODES.B ||
        typeCode1 === OPCODES.S || typeCode2 === OPCODES.S ||
        typeCode1 === OPCODES.T || typeCode2 === OPCODES.T ||
        typeCode1 === OPCODES.P || typeCode2 === OPCODES.P ||
        typeCode1 === OPCODES.X || typeCode2 === OPCODES.X) {

        // These can't be cast.
        throw new PascalError(token, "no common type between " +
          OPCODES.typeCodeToName(typeCode1) +
          " and " + OPCODES.typeCodeToName(typeCode2));
      }

      // Can always cast to a real.
      if (typeCode1 === OPCODES.R) {
        return type1;
      } else if (typeCode2 === OPCODES.R) {
        return type2;
      }

      // Otherwise can cast to an integer.
      if (typeCode1 === OPCODES.I) {
        return type1;
      } else if (typeCode2 === OPCODES.I) {
        return type2;
      }

      // I don't know how we got here.
      throw new PascalError(token, "internal compiler error, can't determine " +
        "common type of " + typeCode1 + " and " + typeCode2);
    } else {
      // Return either type.
      return type1;
    }
  };
}

module.exports = Parser;
