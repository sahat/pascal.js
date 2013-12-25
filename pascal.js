(function() {

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Create a safe reference to the Underscore object for use below.
  var Pascal = function(obj) {
    if (obj instanceof Pascal) return obj;
    if (!(this instanceof Pascal)) return new Pascal(obj);
  };
  // Export the object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Pascal;
    }
    exports.Pascal = Pascal;
  } else {
    root.Pascal = Pascal;
  }

  var PascalError = function (token, message) {
    this.token = token;
    this.message = message;

    // Grab a stack trace.
    this.stack = new Error().stack;
  };

  PascalError.prototype.getMessage = function () {
    var message = "Error: " + this.message;

    // Add token info.
    if (this.token) {
      message += " (\"" + this.token.tokenValue + "\", line " + this.token.lineNumber + ")";
    }

    return message;
  };

  var OPCODE_BITS = 8;
  var OPERAND1_BITS = 9;
  var OPERAND2_BITS = 15;
  var OPCODE_MASK = (1 << OPCODE_BITS) - 1;
  var OPERAND1_MASK = (1 << OPERAND1_BITS) - 1;
  var OPERAND2_MASK = (1 << OPERAND2_BITS) - 1;
  var OPCODE_SHIFT = 0;
  var OPERAND1_SHIFT = OPCODE_SHIFT + OPCODE_BITS;
  var OPERAND2_SHIFT = OPERAND1_SHIFT + OPERAND1_BITS;

  var defs = {
    // Op codes.            Description                  operand1        operand2
    // Subprogram linkage.
    CUP: 0x00,      //      Call user procedure          argsize         iaddr
    CSP: 0x01,      //      Call standard procedure      argsize         stdfunction
    ENT: 0x02,      //      Entry                        register        amount
    MST: 0x03,      //      Mark stack                   level
    RTN: 0x04,      //      Return                       type
    // Comparison.
    EQU: 0x05,      //      Equality                     type
    NEQ: 0x06,      //      Inequality                   type
    GRT: 0x07,      //      Greater than                 type
    GEQ: 0x08,      //      Greater than or equal        type
    LES: 0x09,      //      Less than                    type
    LEQ: 0x0A,      //      Less than or equal           type
    // Integer arithmetic.
    ADI: 0x0B,      //      Integer addition
    SBI: 0x0C,      //      Integer subtraction
    NGI: 0x0D,      //      Integer sign inversion
    MPI: 0x0E,      //      Integer multiplication
    DVI: 0x0F,      //      Integer division
    MOD: 0x10,      //      Integer modulo
    ABI: 0x11,      //      Integer absolute value
    SQI: 0x12,      //      Integer square
    INC: 0x13,      //      Integer increment            i-type
    DEC: 0x14,      //      Integer decrement            i-type
    // Real arithmetic.
    ADR: 0x15,      //      Real addition
    SBR: 0x16,      //      Real subtraction
    NGR: 0x17,      //      Real sign inversion
    MPR: 0x18,      //      Real multiplication
    DVR: 0x19,      //      Real division
    ABR: 0x1A,      //      Real absolute value
    SQR: 0x1B,      //      Real square
    // Boolean.
    IOR: 0x1C,      //      Inclusive OR.
    AND: 0x1D,      //      AND
    XOR: 0x1E,      //      Exclusive OR.
    NOT: 0x1F,      //      NOT.
    // Set operations.
    INN: 0x20,      //      Set membership.
    UNI: 0x21,      //      Set union.
    INT: 0x22,      //      Set intersection.
    DIF: 0x23,      //      Set difference.
    CMP: 0x24,      //      Set complement.
    SGS: 0x25,      //      Generate singleton set.
    // Jump.
    UJP: 0x26,      //      Unconditional jump.                          iaddr
    XJP: 0x27,      //      Indexed jump.                                iaddr
    FJP: 0x28,      //      False jump.                                  iaddr
    TJP: 0x29,      //      True jump.                                   iaddr
    // Conversion.
    FLT: 0x2A,      //      Integer to real.
    FLO: 0x2B,      //      Integer to real (2nd entry on stack).
    TRC: 0x2C,      //      Truncate.
    RND: 0x2C,      //      Round.
    CHR: 0x2C,      //      Integer to char.
    ORD: 0x2C,      //      Anything to integer.
    // Termination.
    STP: 0x30,      //      Stop.
    // Data reference.
    LDA: 0x31,      //      Load address of data         level           offset
    LDC: 0x32,      //      Load constant                type            cindex
    LDI: 0x33,      //      Load indirect                type
    LVA: 0x34,      //      Load value (address)         level           offset
    LVB: 0x35,      //      Load value (boolean)         level           offset
    LVC: 0x36,      //      Load value (character)       level           offset
    LVI: 0x37,      //      Load value (integer)         level           offset
    LVR: 0x38,      //      Load value (real)            level           offset
    LVS: 0x39,      //      Load value (set)             level           offset
    STI: 0x3A,      //      Store indirect               type
    IXA: 0x3B,      //      Compute indexed address                      stride

    // Registers.
    REG_SP: 0x00,   //      Stack pointer.
    REG_EP: 0x01,   //      Extreme pointer (not used in this machine).
    REG_MP: 0x02,   //      Mark pointer.
    REG_PC: 0x03,   //      Program counter.
    REG_NP: 0x04,   //      New pointer.

    // Types.
    A: 0x00,        //      Address.
    B: 0x01,        //      Boolean.
    C: 0x02,        //      Character.
    I: 0x03,        //      Integer.
    R: 0x04,        //      Real.
    S: 0x05,        //      String.
    T: 0x06,        //      Set.
    P: 0x07,        //      Procedure (aka void, returned by procedure).
    X: 0x08,        //      Any.

    // The Mark is the area at the bottom of each frame. It contains (low to high address):
    //
    //     Return value (rv).
    //     Static link (sl).
    //     Dynamic link (dl).
    //     Extreme pointer (es), not used.
    //     Return address (ra).
    //
    MARK_SIZE: 5,

    // Opcode number (such as 0x32) to name ("LDC").
    opcodeToName: {
      // Populated procedurally below.
    },

    // Construct a machine language instruction.
    make: function (opcode, operand1, operand2) {
      // Allow caller to leave out these operands.
      operand1 = operand1 || 0;
      operand2 = operand2 || 0;

      // Sanity check.
      if (operand1 < 0) {
        throw new PascalError(null, "negative operand1: " + operand1);
      }
      if (operand1 > OPERAND1_MASK) {
        throw new PascalError(null, "too large operand1: " + operand1);
      }
      if (operand2 < 0) {
        throw new PascalError(null, "negative operand2: " + operand2);
      }
      if (operand2 > OPERAND2_MASK) {
        throw new PascalError(null, "too large operand2: " + operand2);
      }

      return (opcode << OPCODE_SHIFT) |
        (operand1 << OPERAND1_SHIFT) |
        (operand2 << OPERAND2_SHIFT);
    },

    // Return the opcode of the instruction.
    getOpcode: function (i) {
      return (i >>> OPCODE_SHIFT) & OPCODE_MASK;
    },

    // Return operand 1 of the instruction.
    getOperand1: function (i) {
      return (i >>> OPERAND1_SHIFT) & OPERAND1_MASK;
    },

    // Return operand 2 of the instruction.
    getOperand2: function (i) {
      return (i >>> OPERAND2_SHIFT) & OPERAND2_MASK;
    },

    // Return a string version of the instruction.
    disassemble: function (i) {
      var opcode = this.getOpcode(i);
      var operand1 = this.getOperand1(i);
      var operand2 = this.getOperand2(i);

      return this.opcodeToName[opcode] + " " + operand1 + " " + operand2;
    },

    // Converts a type code like defs.I to "integer", or null if not valid.
    typeCodeToName: function (typeCode) {
      switch (typeCode) {
        case this.A:
          return "pointer";
        case this.B:
          return "boolean";
        case this.C:
          return "char";
        case this.I:
          return "integer";
        case this.R:
          return "real";
        case this.S:
          return "string";
        default:
          throw new PascalError(null, "unknown type code " + typeCode);
      }
    }
  };

  // Make an inverse table of opcodes.
  defs.opcodeToName[defs.CUP] = "CUP";
  defs.opcodeToName[defs.CSP] = "CSP";
  defs.opcodeToName[defs.ENT] = "ENT";
  defs.opcodeToName[defs.MST] = "MST";
  defs.opcodeToName[defs.RTN] = "RTN";
  defs.opcodeToName[defs.EQU] = "EQU";
  defs.opcodeToName[defs.NEQ] = "NEQ";
  defs.opcodeToName[defs.GRT] = "GRT";
  defs.opcodeToName[defs.GEQ] = "GEQ";
  defs.opcodeToName[defs.LES] = "LES";
  defs.opcodeToName[defs.LEQ] = "LEQ";
  defs.opcodeToName[defs.ADI] = "ADI";
  defs.opcodeToName[defs.SBI] = "SBI";
  defs.opcodeToName[defs.NGI] = "NGI";
  defs.opcodeToName[defs.MPI] = "MPI";
  defs.opcodeToName[defs.DVI] = "DVI";
  defs.opcodeToName[defs.MOD] = "MOD";
  defs.opcodeToName[defs.ABI] = "ABI";
  defs.opcodeToName[defs.SQI] = "SQI";
  defs.opcodeToName[defs.INC] = "INC";
  defs.opcodeToName[defs.DEC] = "DEC";
  defs.opcodeToName[defs.ADR] = "ADR";
  defs.opcodeToName[defs.SBR] = "SBR";
  defs.opcodeToName[defs.NGR] = "NGR";
  defs.opcodeToName[defs.MPR] = "MPR";
  defs.opcodeToName[defs.DVR] = "DVR";
  defs.opcodeToName[defs.ABR] = "ABR";
  defs.opcodeToName[defs.SQR] = "SQR";
  defs.opcodeToName[defs.IOR] = "IOR";
  defs.opcodeToName[defs.AND] = "AND";
  defs.opcodeToName[defs.XOR] = "XOR";
  defs.opcodeToName[defs.NOT] = "NOT";
  defs.opcodeToName[defs.INN] = "INN";
  defs.opcodeToName[defs.UNI] = "UNI";
  defs.opcodeToName[defs.INT] = "INT";
  defs.opcodeToName[defs.DIF] = "DIF";
  defs.opcodeToName[defs.CMP] = "CMP";
  defs.opcodeToName[defs.SGS] = "SGS";
  defs.opcodeToName[defs.UJP] = "UJP";
  defs.opcodeToName[defs.XJP] = "XJP";
  defs.opcodeToName[defs.FJP] = "FJP";
  defs.opcodeToName[defs.TJP] = "TJP";
  defs.opcodeToName[defs.FLT] = "FLT";
  defs.opcodeToName[defs.FLO] = "FLO";
  defs.opcodeToName[defs.TRC] = "TRC";
  defs.opcodeToName[defs.RND] = "RND";
  defs.opcodeToName[defs.CHR] = "CHR";
  defs.opcodeToName[defs.ORD] = "ORD";
  defs.opcodeToName[defs.STP] = "STP";
  defs.opcodeToName[defs.LDA] = "LDA";
  defs.opcodeToName[defs.LDC] = "LDC";
  defs.opcodeToName[defs.LDI] = "LDI";
  defs.opcodeToName[defs.LVA] = "LVA";
  defs.opcodeToName[defs.LVB] = "LVB";
  defs.opcodeToName[defs.LVC] = "LVC";
  defs.opcodeToName[defs.LVI] = "LVI";
  defs.opcodeToName[defs.LVR] = "LVR";
  defs.opcodeToName[defs.LVS] = "LVS";
  defs.opcodeToName[defs.STI] = "STI";
  defs.opcodeToName[defs.IXA] = "IXA";




  var isAlpha = function (ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  };

  // Whether the character is a digit.
  var isDigit = function (ch) {
    return ch >= '0' && ch <= '9';
  };

  // Whether the character is a valid first character of an identifier.
  var isIdentifierStart = function (ch) {
    return isAlpha(ch) || ch == '_';
  };

  // Whether the character is a valid subsequent (non-first) character of an identifier.
  var isIdentifierPart = function (ch) {
    return isIdentifierStart(ch) || isDigit(ch);
  };

  // Whether the character is whitespace.
  var isWhitespace = function (ch) {
    return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r';
  };

  // Format number or string to width characters, left-aligned.
  var leftAlign = function (value, width) {
    // Convert to string.
    value = "" + value;

    // Pad to width.
    while (value.length < width) {
      value = value + " ";
    }

    return value;
  };

  // Format number or string to width characters, right-aligned.
  var rightAlign = function (value, width) {
    // Convert to string.
    value = "" + value;

    // Pad to width.
    while (value.length < width) {
      value = " " + value;
    }

    return value;
  };

  // Truncate toward zero.
  var trunc = function (value) {
    if (value < 0) {
      return Math.ceil(value);
    } else {
      return Math.floor(value);
    }
  };

  // Repeat a string "count" times.
  var repeatString = function (s, count) {
    var result = "";

    // We go through each bit of "count", adding a string of the right length
    // to "result" if the bit is 1.
    while (true) {
      if ((count & 1) !== 0) {
        result += s;
      }

      // Move to the next bit.
      count >>= 1;
      if (count === 0) {
        // Exit here before needlessly doubling the size of "s".
        break;
      }

      // Double the length of "s" to correspond to the value of the shifted bit.
      s += s;
    }

    return result;
  };

  // Log an object written out in human-readable JSON. This can't handle
  // circular structures.
  var logAsJson = function (obj) {
    console.log(JSON.stringify(obj, null, 2));
  };

  var Token = function (value, type) {
    this.tokenValue = value;
    this.tokenType = type;
    this.lineNumber = -1;
  };

  Token.T_IDENTIFIER = 0;
  Token.T_NUMBER = 1;
  Token.T_SYMBOL = 2; // T_OP
  Token.T_COMMENT = 3;
  Token.T_STRING = 4;
  Token.T_EOF = 5;
  Token.T_RESERVED = 6;

  Token.prototype.isEqualTo = function(second) {
    return this.tokenType === second.tokenType &&
      this.tokenValue === second.tokenValue;
  };

  Token.prototype.isSymbol = function(symbol) {
    return this.tokenType === Token.T_SYMBOL && this.tokenValue === symbol;
  };

  Token.prototype.isReserved = function(reservedWord) {
    return this.tokenType === Token.T_RESERVED &&
      this.tokenValue.toLowerCase() === reservedWord.toLowerCase();
  };

  var RawData = function () {
    this.length = 0;
    this.data = [];
    this.simpleTypeCodes = [];
  };

  // Adds a piece of data and its simple type (defs.I, etc.) to the list.
  RawData.prototype.add = function (datum, simpleTypeCode) {
    this.length++;
    this.data.push(datum);
    this.simpleTypeCodes.push(simpleTypeCode);
  };

  // Adds a SIMPLE_TYPE node.
  RawData.prototype.addNode = function (node) {
    this.add(node.getConstantValue(), node.expressionType.getSimpleTypeCode());
  };

  // Print the array for human debugging.
  RawData.prototype.print = function () {
    return "(" + this.data.join(", ") + ")";
  };

  var SYMBOLS = ['<', '<>', '<<', ':', ':=', '>', '>>', '<=', '>=', '-', '+',
    '*', '/', ';', ',', '[', ']', '(', ')', '=', '^', '@', '(*'];

  var RESERVED = ['program', 'var', 'begin', 'end', 'type', 'procedure', 'uses',
    'function', 'for', 'while', 'repeat', 'do', 'then', 'downto',
    'to','if', 'else', 'array', 'of', 'not', 'or',  'mod', 'and',
    'const', 'div','record', 'exit'];

  var isReserved = function (value) {
    return RESERVED.indexOf(value.toLowerCase()) !== -1;
  };

  var Lexer = function (stream) {
    this.stream = stream;
    this.nextToken = null;
  };

  Lexer.prototype.next = function () {
    var token = this.lookAhead();

    // We've used up this token, force the next next() or lookAhead() to fetch another.
    this.nextToken = null;

    return token;
  };

  // Peeks at the next token.
  Lexer.prototype.lookAhead = function () {
    if (!this.nextToken) this.nextToken = this.scanOneToken();
    return this.nextToken;
  };

  // Always gets another token.
  Lexer.prototype.scanOneToken = function () {
    var lineNumber;
    var ch = this.stream.next();

    // Skip whitespace.
    while (isWhitespace(ch)) {
      lineNumber = this.stream.lineNumber;

      ch = this.stream.next();
      console.log(ch);

      if (ch === -1) {
        return new Token(null, Token.T_EOF);
      }
    }

    // Check each type of token.
    var token = this.maximalMunch(ch, SYMBOLS);
    if (token !== null && token.isSymbol("(*")) {
      // Comment.

      // Keep reading until we get "*)".
      var value = "";
      while (true) {
        ch = this.stream.next();
        if (ch === -1) {
          break;
        } else if (ch === "*" && this.stream.lookAhead() === ")") {
          // Skip ")".
          this.stream.next();
          break;
        }
        value += ch;
      }
      token = new Token(value, Token.T_COMMENT);
    }

    if (token === null && isIdentifierStart(ch)) {
      // Keep adding more characters until we're not part of this token anymore.
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.lookAhead();
        if (ch === -1 || !isIdentifierPart(ch)) {
          break;
        }
        this.stream.next();
      }
      var tokenType = isReserved(value) ? Token.T_RESERVED : Token.T_IDENTIFIER;
      token = new Token(value, tokenType);
    }
    if (token === null && (isDigit(ch) || ch === ".")) {
      if (ch === ".") {
        // This could be a number, a dot, or two dots.
        var nextCh = this.stream.lookAhead();
        if (nextCh === ".") {
          // Two dots.
          this.stream.next();
          token = new Token("..", Token.T_SYMBOL);
        } else if (!isDigit(nextCh)) {
          // Single dot.
          token = new Token(".", Token.T_SYMBOL);
        } else {
          // It's a number, leave token null.
        }
      }
      if (token === null) {
        // Parse number. Keep adding more characters until we're not
        // part of this token anymore.
        var value = "";
        var sawDecimalPoint = ch === ".";
        while (true) {
          value += ch;
          ch = this.stream.lookAhead();
          if (ch === -1) {
            break;
          }
          if (ch === ".") {
            // This may be a decimal point, but it may be the start
            // of a ".." symbol. Peek twice and push back.
            this.stream.next();
            var nextCh = this.stream.lookAhead();
            this.stream.pushBack(ch);
            if (nextCh === ".") {
              // Double dot, end of number.
              break;
            }

            // Now see if this single point is part of us or a separate symbol.
            if (sawDecimalPoint) {
              break;
            } else {
              // Allow one decimal point.
              sawDecimalPoint = true;
            }
          } else if (!isDigit(ch)) {
            break;
          }
          // XXX Need to parse scientific notation.
          this.stream.next();
        }
        token = new Token(value, Token.T_NUMBER);
      }
    }
    if (token === null && ch === "{") {
      // Comment.

      // Skip opening brace.
      ch = this.stream.next();

      // Keep adding more characters until we're not part of this token anymore.
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.next();
        if (ch === -1 || ch === "}") {
          break;
        }
      }
      token = new Token(value, Token.T_COMMENT);
    }
    if (token === null && ch === "'") {
      // String literal.

      // Skip opening quote.
      ch = this.stream.next();

      // Keep adding more characters until we're not part of this token anymore.
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.next();
        if (ch === "'") {
          // Handle double quotes.
          if (this.stream.lookAhead() === "'") {
            // Eat next quote. First one will be added at top of loop.
            this.stream.next();
          } else {
            break;
          }
        } else if (ch === -1) {
          break;
        }
      }
      token = new Token(value, Token.T_STRING);
    }
    if (token === null) {
      // Unknown token.
      token = new Token(ch, Token.T_SYMBOL);
      token.lineNumber = lineNumber;
      throw new PascalError(token, "unknown symbol");
    }

    token.lineNumber = lineNumber;

    console.log("Fetched token \"" + token.tokenValue + "\" of type " +
      token.tokenType + " on line " + token.lineNumber);

    return token;
  };

  // Find the longest symbols in the specified list. Returns a Token or null.
  Lexer.prototype.maximalMunch = function (ch, symbols) {
    var longestSymbol = null;
    var nextCh = this.stream.lookAhead();
    var twoCh = nextCh === -1 ? ch : ch + nextCh;

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];

      if ((symbol.length === 1 && ch === symbol) ||
        (symbol.length === 2 && twoCh === symbol)) {

        if (longestSymbol === null || symbol.length > longestSymbol.length) {
          longestSymbol = symbol;
        }
      }
    }

    if (!longestSymbol) return null;

    if (longestSymbol.length === 2) {
      // Eat the second character.
      this.stream.next();
    }

    return new Token(longestSymbol, Token.T_SYMBOL);
  };

  var Stream = function (input) {
    this.input = input;
    this.position = 0;
    this.lineNumber = 1;
  };

  // Returns the next character, or -1 on end of file.
  Stream.prototype.next = function () {
    var ch = this.lookAhead();
    if (ch == "\n") {
      this.lineNumber++;
    }
    if (ch != -1) {
      this.position++;
    }
    return ch;
  };

  // Peeks at the next character, or -1 on end of file.
  Stream.prototype.lookAhead = function () {
    if (this.position >= this.input.length) {
      return -1;
    }
    return this.input[this.position];
  };

  // Inverse of "next()" method.
  Stream.prototype.pushBack = function (ch) {
    if (this.position === 0) {
      throw new "Can't push back at start of stream";
    }
    this.position--;
    // Sanity check.
    if (this.input[this.position] != ch) {
      throw new "Pushed back character doesn't match";
    }
  };

  var Symbol = function (name, type, address, byReference) {
    this.name = name;
    this.type = type;
    this.address = address;
    this.isNative = false;
    this.value = null;
    this.byReference = byReference;
  };

  var Node = function (nodeType, token, additionalFields) {
    // The type of node (e.g., Node.PROGRAM), see below.
    this.nodeType = nodeType;

    // The token that created this node.
    this.token = token;

    // Symbol table (for node types PROGRAM, PROCEDURE, and FUNCTION).
    this.symbolTable = null;

    // Type of this node (for expressions).
    this.expressionType = null;

    // Symbol in the symbol table (if VAR, CONST, etc.).
    this.symbol = null;

    // Symbol lookup in the symbol table (if IDENTIFIER, ARRAY, FUNCTION_CALL, etc.).
    this.symbolLookup = null;

    // Fold other fields into our own.
    for (var field in additionalFields) {
      this[field] = additionalFields[field];
    }
  };

  // Basic types. These don't have additional fields, but their token usually has a value.
  Node.IDENTIFIER = 0;
  Node.T_NUMBER = 1;
  Node.T_STRING = 2;
  Node.BOOLEAN = 3;
  Node.POINTER = 4;

  // Program, procedure, or function declaration.
  //     name: name of program, procedure, or function (identifier).
  //     declarations: functions, procedures, var, const, uses, etc.
  //     block: block.
  Node.PROGRAM = 10;
  Node.PROCEDURE = 11;
  Node.FUNCTION = 12;

  // Uses declaration.
  //     name: module name (identifier).
  Node.USES = 13;

  // Var declaration.
  //     name: variable name (identifier).
  //     type: variable type.
  Node.VAR = 14;

  // Range of ordinals.
  //     low: lowest index (number).
  //     high: highest index (number).
  Node.RANGE = 15;

  // Begin/end block.
  //     statements: statements.
  Node.BLOCK = 16;

  // Function and procedure parameter.
  //     name: parameter name (identifier).
  //     type: type.
  //     byReference: whether this parameter is by reference.
  Node.PARAMETER = 17;

  // Cast expression to type.
  //     type: destination type.
  //     expression: source node.
  Node.CAST = 18;

  // Constant declaration.
  //     name: variable name (identifier).
  //     type: type.
  //     value: value.
  Node.CONST = 19;

  // Assignment.
  //     lhs: variable being assigned to.
  //     rhs: expression to assign.
  Node.ASSIGNMENT = 20;

  // Procedure call statement.
  //     name: procedure name.
  //     argumentList: procedure arguments.
  Node.PROCEDURE_CALL = 21;

  // Repeat/until.
  //     block: block.
  //     expression: expression.
  Node.REPEAT = 22;

  // For loop.
  //     variable: variable (identifier).
  //     fromExpr: from expression.
  //     toExpr: to expression.
  //     body: body statement.
  //     downto: whether it's a downto loop (true) or to (false).
  Node.FOR = 23;

  // If.
  //     expression: expression.
  //     thenStatement: then statement.
  //     elseStatement: else statement or null.
  Node.IF = 24;

  // Exit.
  //     No additional fields.
  Node.EXIT = 25;

  // Record field.
  //     name: field name (identifier).
  //     type: type.
  //     offset: integer offset from base of record.
  Node.FIELD = 26;

  // While loop.
  //     expression: expression.
  //     statement: statement to loop.
  Node.WHILE = 27;

  // Typed constant. These are really pre-initialized variables.
  //     name: constant name (identifier).
  //     type: declared type.
  //     rawData: a RawData object.
  Node.TYPED_CONST = 28;

  // Unary operators.
  //     expression: expression to act on.
  Node.NOT = 30;
  Node.NEGATIVE = 31;

  // Binary operators. Children are lhs and rhs.
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

  // Field designator (expression.fieldName).
  //     variable: the part before the dot, which evaluates to a record type.
  //     field: designated field (FIELD).
  Node.FIELD_DESIGNATOR = 54;

  // Function call expression.
  //     name: function name (identifier).
  //     argumentList: arguments (expressions).
  Node.FUNCTION_CALL = 60;

  // Array dereference.
  //     variable: expression that evaluates to an array.
  //     indices: expression for each index.
  Node.ARRAY = 61;

  // Type definition.
  //     name: name of new type (identifier).
  //     type: aliased type.
  Node.TYPE = 62;

  // Address-of (@) operator.
  //     variable: variable to take the address of.
  Node.ADDRESS_OF = 63

  // Dereference of a pointer (^).
  //     variable: variable to dereference.
  Node.DEREFERENCE = 64;

  // Simple type.
  //     typeCode: one of defs.A, defs.B, defs.C, defs.I, defs.R, or defs.S.
  //     typeName: (defs.A only) name of the type being pointed to. This must be a name
  //         and not a type because we can point to ourselves or have
  //         mutually-referring types.
  //     type: (defs.A only) type being pointed to. This can initially be null, but is
  //         filled in once we have enough types to resolve the type name.
  Node.SIMPLE_TYPE = 70;

  // Enumerated type.
  //     entries: each entry (identifier).
  Node.ENUM_TYPE = 71;

  // Record type.
  //     fields: FIELD nodes.
  Node.RECORD_TYPE = 73;

  // Array type.
  //     elementType: element type.
  //     ranges: RANGE nodes.
  Node.ARRAY_TYPE = 74;

  // Set type.
  //     type: type of element (integral SIMPLE_TYPE or ENUM_TYPE).
  //     range: optional RANGE node.
  Node.SET_TYPE = 75;

  // Procedure, function, or program type.
  //     parameters: parameters (Node.PARAMETER).
  //     returnType: return type (SIMPLE_TYPE defs.P if not function).
  Node.SUBPROGRAM_TYPE = 76;

  // Set the symbol table for this program, procedure, or function.
  Node.prototype.setSymbolTable = function (symbolTable) {
    this.symbolTable = symbolTable;
  };

  // Logs the node in JSON format to the console.
  Node.prototype.log = function () {
    console.log(JSON.stringify(this, null, 4));
  };

  // Returns whether the type is numeric (integer, character, or real).
  Node.prototype.isNumericType = function () {
    return this !== null &&
      this.nodeType === Node.SIMPLE_TYPE &&
      (this.typeCode == defs.C ||
        this.typeCode == defs.I ||
        this.typeCode == defs.R);
  };

  // Returns whether the type is boolean.
  Node.prototype.isBooleanType = function () {
    return this !== null &&
      this.nodeType === Node.SIMPLE_TYPE &&
      this.typeCode == defs.B;
  };

  // Returns whether the type is void (procedure return type).
  Node.prototype.isVoidType = function () {
    return this !== null &&
      this.nodeType === Node.SIMPLE_TYPE &&
      this.typeCode == defs.P;
  };

  // If both are identifiers, and are the same identifier (case-insensitive), returns true.
  // If identifiers and not equal, returns false. If either is not an identifier, throws.
  Node.prototype.isSameIdentifier = function (other) {
    if (this.nodeType !== Node.IDENTIFIER || other.nodeType !== Node.IDENTIFIER) {
      throw new PascalError(this.token, "not an identifier");
    }
    return this.token.tokenValue.toLowerCase() === other.token.tokenValue.toLowerCase();
  };

  // Given a type, returns true if it's a simple type and of the specified type code.
  Node.prototype.isSimpleType = function (typeCode) {
    return this.nodeType === Node.SIMPLE_TYPE && this.typeCode === typeCode;
  };

  // Given a T_NUMBER node, returns the value as a float.
  Node.prototype.getNumber = function () {
    if (this.nodeType === Node.T_NUMBER) {
      return parseFloat(this.token.tokenValue);
    } else {
      throw new PascalError(this.token, "expected a number");
    }
  };

  // Given a BOOLEAN node, returns the value as a boolean.
  Node.prototype.getBoolean = function () {
    if (this.nodeType === Node.BOOLEAN) {
      return this.token.tokenValue.toLowerCase() === "true";
    } else {
      throw new PascalError(this.token, "expected a boolean");
    }
  };

  // Given a SIMPLE_TYPE node, returns the type code.
  Node.prototype.getSimpleTypeCode = function () {
    if (this.nodeType === Node.SIMPLE_TYPE) {
      return this.typeCode;
    } else {
      throw new PascalError(this.token, "expected a simple type");
    }
  };

  // Given a RANGE node, returns the lower bound as a number.
  Node.prototype.getRangeLowBound = function () {
    if (this.nodeType === Node.RANGE) {
      return this.low.getNumber();
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  // Given a RANGE node, returns the high bound as a number.
  Node.prototype.getRangeHighBound = function () {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber();
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  // Given a RANGE node, returns the size (high minus low plus 1).
  Node.prototype.getRangeSize = function () {
    if (this.nodeType === Node.RANGE) {
      return this.high.getNumber() - this.low.getNumber() + 1;
    } else {
      throw new PascalError(this.token, "expected a range");
    }
  };

  // Given a RECORD_TYPE node, returns the FIELD node for the given token.
  Node.prototype.getField = function (fieldToken) {
    if (this.nodeType !== Node.RECORD_TYPE) {
      throw new PascalError(this.token, "expected a record");
    }

    if (fieldToken.tokenType !== Token.T_IDENTIFIER) {
      throw new PascalError(fieldToken, "expected a field name");
    }

    // We could use a dictionary for this instead of a linear lookup, but
    // it's not worth the complexity.
    for (var i = 0; i < this.fields.length; i++) {
      var field = this.fields[i];
      if (field.name.token.isEqualTo(fieldToken)) {
        return field;
      }
    }

    throw new PascalError(fieldToken, "field not found in record");
  };

  // Given any expression type, returns the value of the expression. The
  // expression must evaluate to a scalar constant.
  Node.prototype.getConstantValue = function () {
    switch (this.nodeType) {
      case Node.T_NUMBER:
        return this.getNumber();
      case Node.BOOLEAN:
        return this.getBoolean();
      case Node.T_STRING:
        return this.token.tokenValue;
      default:
        throw new PascalError(this.token, "cannot get constant value of node type " +
          this.nodeType);
    }
  };

  // Return the total parameter size of a function's parameters.
  Node.prototype.getTotalParameterSize = function () {
    if (this.nodeType !== Node.SUBPROGRAM_TYPE) {
      throw new PascalError(this.token, "can't get parameter size of non-subprogram");
    }

    var size = 0;

    for (var i = 0; i < this.parameters.length; i++) {
      var parameter = this.parameters[i];
      size += parameter.byReference ? 1 : parameter.type.getTypeSize();
    }

    return size;
  };

  // Given a type node (SIMPLE_TYPE, ARRAY_TYPE, etc.), returns the size of that type.
  Node.prototype.getTypeSize = function () {
    var size;

    switch (this.nodeType) {
      case Node.SIMPLE_TYPE:
        // They all have the same size.
        size = 1;
        break;
      /// case Node.ENUM_TYPE:
      case Node.RECORD_TYPE:
        size = 0;
        for (var i = 0; i < this.fields.length; i++) {
          size += this.fields[i].type.getTypeSize();
        }
        break;
      case Node.ARRAY_TYPE:
        // Start with size of element type.
        size = this.elementType.getTypeSize();

        // Multiply each range size.
        for (var i = 0; i < this.ranges.length; i++) {
          size *= this.ranges[i].getRangeSize();
        }
        break;
      /// case Node.SET_TYPE:
      default:
        throw new PascalError(this.token, "can't get size of type " + this.print());
    }

    return size;
  };

  // Useful types.
  Node.pointerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.A});
  Node.booleanType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.B});
  Node.charType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.C});
  Node.integerType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.I});
  Node.voidType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.P});
  Node.realType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.R});
  Node.stringType = new Node(Node.SIMPLE_TYPE, null, {typeCode: defs.S});

  // Fluid method to set the expression type.
  Node.prototype.withExpressionType = function (expressionType) {
    this.expressionType = expressionType;
    return this;
  };
  Node.prototype.withExpressionTypeFrom = function (node) {
    this.expressionType = node.expressionType;
    return this;
  };

  // Useful methods.
  Node.makeIdentifierNode = function (name) {
    return new Node(Node.IDENTIFIER, new Token(name, Token.T_IDENTIFIER));
  };
  Node.makeNumberNode = function (value) {
    return new Node(Node.T_NUMBER, new Token("" + value, Token.T_NUMBER));
  };
  Node.makeBooleanNode = function (value) {
    return new Node(Node.BOOLEAN, new Token(value ? "True" : "False", Token.T_IDENTIFIER));
  };
  Node.makePointerNode = function (value) {
    // Nil is the only constant pointer.
    if (value !== null) {
      throw new PascalError(null, "nil is the only pointer constant");
    }
    return new Node(Node.POINTER, new Token("Nil", Token.T_IDENTIFIER));
  };

  // Maps a node type (e.g., Node.PROGRAM) to a string ("program", "procedure", or "function").
  Node.nodeLabel = {}; // Filled below.

  // Returns printed version of node.
  Node.prototype.print = function (indent) {
    var s = "";

    // Allow caller to not set indent.
    indent = indent || "";

    switch (this.nodeType) {
      case Node.IDENTIFIER:
      case Node.T_NUMBER:
      case Node.BOOLEAN:
      case Node.POINTER:
        s += this.token.tokenValue;
        break;
      case Node.T_STRING:
        s += "'" + this.token.tokenValue + "'";
        break;
      case Node.PROGRAM:
      case Node.PROCEDURE:
      case Node.FUNCTION:
        // Nest procedures and functions.
        if (this.nodeType !== Node.PROGRAM) {
          indent += "    ";
          s += "\n";
        }

        s += indent + Node.nodeLabel[this.nodeType] + " " + this.name.token.tokenValue;

        // Print parameters and return type.
        s += this.expressionType.print() + ";\n\n";

        // Declarations.
        for (var i = 0; i < this.declarations.length; i++) {
          s += this.declarations[i].print(indent) + ";\n";
        }

        // Main block.
        s += "\n" + this.block.print(indent);

        if (this.nodeType === Node.PROGRAM) {
          s += ".\n";
        }
        break;
      case Node.USES:
        s += indent + "uses " + this.name.token.tokenValue;
        break;
      case Node.VAR:
        s += indent + "var " + this.name.print() + " : " + this.type.print();
        break;
      case Node.RANGE:
        s += this.low.print() + ".." + this.high.print();
        break;
      case Node.BLOCK:
        s += indent + "begin\n";
        for (var i = 0; i < this.statements.length; i++) {
          s += this.statements[i].print(indent + "    ") + ";\n";
        }
        s += indent + "end";
        break;
      case Node.PARAMETER:
        s += (this.byReference ? "var " : "") + this.name.print() +
          " : " + this.type.print();
        break;
      case Node.CAST:
        s += this.type.print() + "(" + this.expression.print() + ")";
        break;
      case Node.CONST:
        s += indent + "const " + this.name.print();
        if (this.type !== null) {
          s += " { : " + this.type.print() + " }";
        }
        s += " = " + this.value.print();
        break;
      case Node.ASSIGNMENT:
        s += indent + this.lhs.print() + " := " + this.rhs.print();
        break;
      case Node.PROCEDURE_CALL:
      case Node.FUNCTION_CALL:
        if (this.nodeType === Node.PROCEDURE_CALL) {
          s += indent;
        }
        s += this.name.print();
        var argumentList = [];
        for (var i = 0; i < this.argumentList.length; i++) {
          argumentList.push(this.argumentList[i].print(indent));
        }
        if (argumentList.length > 0) {
          s += "(" + argumentList.join(", ") + ")";
        }
        break;
      case Node.REPEAT:
        s += indent + "repeat\n";
        s += this.block.print(indent + "    ");
        s += "\n" + indent + "until " + this.expression.print();
        break;
      case Node.FOR:
        s += indent + "for " + this.variable.print() + " := " +
          this.fromExpr.print() + (this.downto ? " downto " : " to ") +
          this.toExpr.print() +
          " do\n";
        s += this.body.print(indent + "    ");
        break;
      case Node.IF:
        s += indent + "if " + this.expression.print() + " then\n";
        s += this.thenStatement.print(indent + "    ");
        if (this.elseStatement) {
          s += "\n" + indent + "else\n";
          s += this.elseStatement.print(indent + "    ");
        }
        break;
      case Node.EXIT:
        s += indent + "Exit";
        break;
      case Node.FIELD:
        s += indent + this.name.print() + " : " + this.type.print(indent);
        break;
      case Node.WHILE:
        s += indent + "while " + this.expression.print() + " do\n" +
          this.statement.print(indent + "    ");
        break;
      case Node.TYPED_CONST:
        s += indent + "const " + this.name.print();
        s += " : " + this.type.print();
        s += " = " + this.rawData.print();
        break;
      case Node.NOT:
        s += "Not " + this.expression.print();
        break;
      case Node.NEGATIVE:
        s += "-" + this.expression.print();
        break;
      case Node.ADDITION:
        s += this.lhs.print() + " + " + this.rhs.print();
        break;
      case Node.SUBTRACTION:
        s += this.lhs.print() + " - " + this.rhs.print();
        break;
      case Node.MULTIPLICATION:
        s += "(" + this.lhs.print() + "*" + this.rhs.print() + ")";
        break;
      case Node.DIVISION:
        s += this.lhs.print() + "/" + this.rhs.print();
        break;
      case Node.EQUALITY:
        s += this.lhs.print() + " = " + this.rhs.print();
        break;
      case Node.INEQUALITY:
        s += this.lhs.print() + " <> " + this.rhs.print();
        break;
      case Node.LESS_THAN:
        s += this.lhs.print() + " < " + this.rhs.print();
        break;
      case Node.GREATER_THAN:
        s += this.lhs.print() + " > " + this.rhs.print();
        break;
      case Node.LESS_THAN_OR_EQUAL_TO:
        s += this.lhs.print() + " <= " + this.rhs.print();
        break;
      case Node.GREATER_THAN_OR_EQUAL_TO:
        s += this.lhs.print() + " >= " + this.rhs.print();
        break;
      case Node.AND:
        s += this.lhs.print() + " and " + this.rhs.print();
        break;
      case Node.OR:
        s += this.lhs.print() + " or " + this.rhs.print();
        break;
      case Node.INTEGER_DIVISION:
        s += this.lhs.print() + " div " + this.rhs.print();
        break;
      case Node.MOD:
        s += this.lhs.print() + " mod " + this.rhs.print();
        break;
      case Node.FIELD_DESIGNATOR:
        s += this.variable.print() + "." + this.field.name.print();
        break;
      case Node.ARRAY:
        var indices = [];
        for (var i = 0; i < this.indices.length; i++) {
          indices.push(this.indices[i].print());
        }
        s += this.variable.print() + "[" + indices.join(",") + "]";
        break;
      case Node.TYPE:
        s += indent + "type " + this.name.print() + " = " + this.type.print();
        break;
      case Node.ADDRESS_OF:
        s += "@" + this.variable.print();
        break;
      case Node.DEREFERENCE:
        s += this.variable.print() + "^";
        break;
      case Node.SIMPLE_TYPE:
        if (this.typeCode === defs.A) {
          if (this.typeName) {
            s += "^" + this.typeName.print();
          } else {
            // Generic pointer.
            s += "Pointer";
          }
        } else {
          s += defs.typeCodeToName(this.typeCode);
        }
        break;
      case Node.RECORD_TYPE:
        s += "record\n";
        for (var i = 0; i < this.fields.length; i++) {
          s += this.fields[i].print(indent + "    ") + ";\n";
        }
        s += indent + "end";
        break;
      case Node.ARRAY_TYPE:
        var ranges = [];
        for (var i = 0; i < this.ranges.length; i++) {
          ranges.push(this.ranges[i].print());
        }
        s += "array[" + ranges.join(",") + "] of " + this.elementType.print();
        break;
      case Node.SUBPROGRAM_TYPE:
        // Print parameters.
        var parameters = [];
        for (var i = 0; i < this.parameters.length; i++) {
          parameters.push(this.parameters[i].print());
        }
        if (parameters.length > 0) {
          s += "(" + parameters.join("; ") + ")";
        }

        // Functions only: return type.
        if (!this.returnType.isSimpleType(defs.P)) {
          s += " : " + this.returnType.print();
        }
        break;
      default:
        s = "<UNKNOWN>";
        break;
    }

    return s;
  };

  // Return a node that casts "this" to "type". Returns "this" if it's already
  // of type "type". Throws if "this" can't be cast to "type".
  Node.prototype.castToType = function (type) {
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
      throw new PascalError(this.token, "can't cast from " + nodeType.nodeType +
        " to " + type.nodeType);
    }

    // Can cast between some simple types.
    if (type.nodeType === Node.SIMPLE_TYPE) {
      if (type.typeCode !== nodeType.typeCode) {
        // They're different simple types.
        var typeCode = type.typeCode;
        var nodeTypeCode = nodeType.typeCode;

        if (typeCode === defs.A || nodeTypeCode === defs.A ||
          typeCode === defs.B || nodeTypeCode === defs.B ||
          typeCode === defs.S || nodeTypeCode === defs.S ||
          typeCode === defs.T || nodeTypeCode === defs.T ||
          typeCode === defs.P || nodeTypeCode === defs.P ||
          typeCode === defs.X || nodeTypeCode === defs.X) {

          // These can't be cast.
          throw new PascalError(this.token, "can't cast from " +
            defs.typeCodeToName(nodeTypeCode) +
            " to " + defs.typeCodeToName(typeCode));
        }

        // Can always cast to a real.
        if (typeCode === defs.R ||
          (typeCode === defs.I && nodeTypeCode !== defs.R)) {

          var node = new Node(Node.CAST, type.token, {
            type: type,
            expression: this
          });
          node.expressionType = type;
          return node;
        }

        // Can't cast.
        throw new PascalError(this.token, "can't cast from " +
          defs.typeCodeToName(nodeTypeCode) +
          " to " + defs.typeCodeToName(typeCode));
      } else {
        // Same simple typeCode. If they're pointers, then they
        // must be compatible types or the source must be nil.
        if (type.typeCode === defs.A) {
          if (!nodeType.typeName) {
            // Assigning from Nil, always allowed.
          } else if (!type.typeName) {
            // Assigning to generic pointer, always allowed.
          } else if (type.typeName.isSameIdentifier(nodeType.typeName)) {
            // Same pointer type.
          } else {
            // Incompatible pointers, disallow. XXX test this.
            throw new PascalError(this.token, "can't cast from pointer to " +
              nodeType.print() + " to pointer to " + type.print());
          }
        }
      }
    } else {
      // Complex type. XXX We should verify that they're of the same type.
    }

    // Nothing to cast, return existing node.
    return this;
  };

  // Fill in this label map.
  Node.nodeLabel[Node.PROGRAM] = "program";
  Node.nodeLabel[Node.PROCEDURE] = "procedure";
  Node.nodeLabel[Node.FUNCTION] = "function";

  var builtinRandom = function (ctl, t) {
    if (t === undefined) {
      return Math.random();
    } else {
      return Math.round(Math.random()*t);
    }
  };

  var builtin = {
    importSymbols: function (symbolTable) {
      // Built-in types.
      symbolTable.addNativeType("String", Node.stringType);
      symbolTable.addNativeType("Integer", Node.integerType);
      symbolTable.addNativeType("ShortInt", Node.integerType);
      symbolTable.addNativeType("LongInt", Node.integerType);
      symbolTable.addNativeType("Char", Node.charType);
      symbolTable.addNativeType("Boolean", Node.booleanType);
      symbolTable.addNativeType("Real", Node.realType);
      symbolTable.addNativeType("Double", Node.realType);
      symbolTable.addNativeType("Pointer", Node.pointerType);

      // Constants and functions.
      symbolTable.addNativeConstant("Nil", null,
        new Node(Node.SIMPLE_TYPE, new Token("Nil", Token.T_IDENTIFIER), {
          typeCode: defs.A,
          typeName: null,  // Important -- this is what makes this nil.
          type: null
        }));
      symbolTable.addNativeConstant("True", true, Node.booleanType);
      symbolTable.addNativeConstant("False", false, Node.booleanType);
      symbolTable.addNativeConstant("Pi", Math.PI, Node.realType);
      symbolTable.addNativeFunction("Sin", Node.realType, [Node.realType],
        function (ctl, t) { return Math.sin(t); });
      symbolTable.addNativeFunction("Cos", Node.realType, [Node.realType],
        function (ctl, t) { return Math.cos(t); });
      symbolTable.addNativeFunction("Round", Node.integerType, [Node.realType],
        function (ctl, t) { return Math.round(t); });
      symbolTable.addNativeFunction("Trunc", Node.integerType, [Node.realType],
        function (ctl, t) { return (t < 0) ? Math.ceil(t) : Math.floor(t); });
      symbolTable.addNativeFunction("Odd", Node.booleanType, [Node.integerType],
        function (ctl, t) { return Math.round(t) % 2 !== 0; });
      symbolTable.addNativeFunction("Abs", Node.realType, [Node.realType],
        function (ctl, t) { return Math.abs(t); });
      symbolTable.addNativeFunction("Sqrt", Node.realType, [Node.realType],
        function (ctl, t) { return Math.sqrt(t); });
      symbolTable.addNativeFunction("Ln", Node.realType, [Node.realType],
        function (ctl, t) { return Math.log(t); });
      symbolTable.addNativeFunction("Sqr", Node.realType, [Node.realType],
        function (ctl, t) { return t*t; });
      symbolTable.addNativeFunction("Random", Node.realType, [], builtinRandom);
      symbolTable.addNativeFunction("Randomize", Node.voidType, [],
        function (ctl) { /* Nothing. */ });
      var symbol = symbolTable.addNativeFunction("Inc", Node.voidType,
        [Node.integerType, Node.integerType], function (ctl, v, dv) {

          if (dv === undefined) {
            dv = 1;
          }
          ctl.writeDstore(v, ctl.readDstore(v) + dv);
        });
      symbol.type.parameters[0].byReference = true;
      symbolTable.addNativeFunction("WriteLn", Node.voidType, [], function (ctl) {
        // Skip ctl parameter.
        var elements = [];
        for (var i = 1; i < arguments.length; i++) {
          // Convert to string.
          elements.push("" + arguments[i]);
        }
        ctl.writeln(elements.join(" "));
      });
      symbolTable.addNativeFunction("Halt", Node.voidType, [], function (ctl) {
        // Halt VM.
        ctl.stop();
      });
      symbolTable.addNativeFunction("Delay", Node.voidType, [Node.integerType],
        function (ctl, ms) {
          // Tell VM to delay by ms asynchronously.
          ctl.delay(ms);
        });
      symbol = symbolTable.addNativeFunction("New", Node.voidType,
        [Node.pointerType, Node.integerType],
        function (ctl, p, size) {

          // Allocate and store address in p.
          ctl.writeDstore(p, ctl.malloc(size));
        });
      symbol.type.parameters[0].byReference = true;
      symbol = symbolTable.addNativeFunction("GetMem", Node.voidType,
        [Node.pointerType, Node.integerType],
        function (ctl, p, size) {

          // Allocate and store address in p.
          ctl.writeDstore(p, ctl.malloc(size));
        });
      symbol.type.parameters[0].byReference = true;
      symbol = symbolTable.addNativeFunction("Dispose", Node.voidType,
        [Node.pointerType],
        function (ctl, p) {

          // Free p and store 0 (nil) into it.
          ctl.free(ctl.readDstore(p));
          ctl.writeDstore(p, 0);
        });
      symbol.type.parameters[0].byReference = true;
    }
  };

  var Bytecode = function (native) {
    // Instructions. Array of doubles.
    this.istore = [];

    // Constants. This is an ordered list of JavaScript constant objects, such
    // as numbers and strings.
    this.constants = [];

    // Typed constants. These are copied to the start of the dstore when
    // the bytecode is loaded.
    this.typedConstants = [];

    // Index into istore where program should start.
    this.startAddress = 0;

    // Map from istore address to comment.
    this.comments = {};

    // Native methods.
    this.native = native;
  };

  // Add a constant (of any type), returning the cindex.
  Bytecode.prototype.addConstant = function (c) {
    // Re-use existing constants. We could use a hash table for this.
    for (var i = 0; i < this.constants.length; i++) {
      if (c === this.constants[i]) {
        return i;
      }
    }

    // Add new constants.
    this.constants.push(c);
    return this.constants.length - 1;
  };

  // Add an array of words to the end of the typed constants. Returns the
  // address of the item that was just added.
  Bytecode.prototype.addTypedConstants = function (raw) {
    var address = this.typedConstants.length;

    // Append entire "raw" array to the back of the typedConstants array.
    this.typedConstants.push.apply(this.typedConstants, raw);

    return address;
  };

  // Add an opcode to the istore.
  Bytecode.prototype.add = function (opcode, operand1, operand2, comment) {
    var i = defs.make(opcode, operand1, operand2);
    var address = this.getNextAddress();
    this.istore.push(i);
    if (comment) {
      this.addComment(address, comment);
    }
  };

  // Replace operand2 of the instruction.
  Bytecode.prototype.setOperand2 = function (address, operand2) {
    var i = this.istore[address];
    i = defs.make(defs.getOpcode(i), defs.getOperand1(i), operand2);
    this.istore[address] = i;
  };

  // Return the next address to be added to the istore.
  Bytecode.prototype.getNextAddress = function () {
    return this.istore.length;
  };

  // Return a printable version of the bytecode object.
  Bytecode.prototype.print = function () {
    return this._printConstants() + "\n" + this._printIstore();
  };

  // Set the starting address to the next instruction that will be added.
  Bytecode.prototype.setStartAddress = function () {
    this.startAddress = this.getNextAddress();
  };

  // Add a comment to the address.
  Bytecode.prototype.addComment = function (address, comment) {
    var existingComment = this.comments[address];
    if (existingComment) {
      // Add to existing comment.
      comment = existingComment + "; " + comment;
    }
    this.comments[address] = comment;
  };

  // Return a printable version of the constant table.
  Bytecode.prototype._printConstants = function () {
    var lines = [];
    for (var i = 0; i < this.constants.length; i++) {
      var value = this.constants[i];
      if (typeof(value) === "string") {
        value = "'" + value + "'";
      }
      lines.push(rightAlign(i, 4) + ": " + value);
    }

    return "Constants:\n" + lines.join("\n") + "\n";
  };

  // Return a printable version of the istore array.
  Bytecode.prototype._printIstore = function () {
    var lines = [];
    for (var address = 0; address < this.istore.length; address++) {
      var line = rightAlign(address, 4) + ": " +
        leftAlign(defs.disassemble(this.istore[address]), 11);
      var comment = this.comments[address];
      if (comment) {
        line += " ; " + comment;
      }
      lines.push(line);
    }

    return "Istore:\n" + lines.join("\n") + "\n";
  };

  var CommentStripper = function (lexer) {
    this.lexer = lexer;
  };

  // Returns the next token.
  CommentStripper.prototype.next = function () {
    while (true) {
      var token = this.lexer.next();
      if (token.tokenType != Token.T_COMMENT) {
        return token;
      }
    }
  };

  // Peeks at the next token.
  CommentStripper.prototype.lookAhead = function () {
    while (true) {
      var token = this.lexer.lookAhead();
      if (token.tokenType != Token.T_COMMENT) {
        return token;
      } else {
        // Skip the comment.
        this.lexer.next();
      }
    }
  };


  var NativeProcedure = function (name, returnType, parameterTypes, fn) {
    this.name = name;
    this.returnType = returnType;
    this.parameterTypes = parameterTypes;
    this.fn = fn;
  };

  var Native = function () {
    // List of NativeProcedure objects. The index within the array is the
    // number passed to the "CSP" instruction.
    this.nativeProcedures = [];
  };

  // Adds a native method, returning its index.
  Native.prototype.add = function (nativeProcedure) {
    var index = this.nativeProcedures.length;
    this.nativeProcedures.push(nativeProcedure);
    return index;
  };

  // Get a native method by index.
  Native.prototype.get = function (index) {
    return this.nativeProcedures[index];
  };

  var SymbolLookup = function (symbol, level) {
    // The symbol found.
    this.symbol = symbol;

    // The number of levels that had to be searched. Zero means it was
    // found in the innermost level.
    this.level = level;
  };

  var SymbolTable = function (parentSymbolTable) {
    // Map from symbol name (all lowercase, since Pascal is case-insensitive) to
    // a Symbol object. This stores variables, constants, procedure, and functions.
    // Basically any symbol that can be references in an expression.
    this.symbols = {};

    // Map from type name (all lowercase, since Pascal is case-insensitive) to
    // a Symbol object. This stores user-defined types.
    this.types = {};

    // Parent of this table. Symbols not found in this table are looked up in the
    // parent one if it's not null.
    this.parentSymbolTable = parentSymbolTable;

    // Registry of native functions. We only have one of these, so if we have a parent,
    // use its object.
    this.native = parentSymbolTable ? parentSymbolTable.native : new Native();

    // Size (in words) of all variables in this frame.
    this.totalVariableSize = 0;

    // Size (in words) of all parameters in this frame.
    this.totalParameterSize = 0;

    // Size (in words) of all typed constants in this frame.
    this.totalTypedConstantsSize = 0;
  };

  // Adds a symbol to the table. Returns the Symbol object.
  SymbolTable.prototype.addSymbol = function (name, nodeType, type, byReference) {
    var address = -1; // Indicates error.

    // Default to false.
    byReference = byReference || false;

    if (nodeType === Node.VAR) {
      // For this to work, all parameters must be added to the symbol table
      // before any variable is added.
      address = defs.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.CONST) {
      // Nothing. We may later treat constant arrays like read-only
      // variables, in the sense that they end up on the stack. I don't
      // know how we'd populate them. I think in the real p-machine they
      // end up above the heap and are loaded declaratively from the
      // bytecode object.
    } else if (nodeType === Node.TYPED_CONST) {
      // They end up being copied to the stack at the start of
      // a function call, like a regular variable.
      address = defs.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.PARAMETER) {
      address = defs.MARK_SIZE + this.totalParameterSize;
      this.totalParameterSize += byReference ? 1 : type.getTypeSize();
    }

    var symbol = new Symbol(name, type, address, byReference);
    this.symbols[name.toLowerCase()] = symbol;

    return symbol;
  };

  // Add a user-defined type, returning the Symbol object.
  SymbolTable.prototype.addType = function (name, type) {
    var symbol = new Symbol(name, type, 0, false);
    this.types[name.toLowerCase()] = symbol;

    return symbol;
  };

  // Returns the SymbolLookup object for the name. If the name is not found
  // in this table, the parent table is consulted if it's set. Throws if not
  // found. The nodeType is optional. If set, only nodes of that type will
  // be returned. The "level" parameter is for internal use and should be left out.
  SymbolTable.prototype.getSymbol = function (token, nodeType, level) {
    var name = token.tokenValue.toLowerCase();

    // Default to zero.
    level = level || 0;

    if (this.symbols.hasOwnProperty(name)) {
      var symbol = this.symbols[name];

      // Match optional nodeType.
      if (!nodeType || symbol.type.nodeType === nodeType) {
        return new SymbolLookup(symbol, level);
      }
    }

    if (this.parentSymbolTable !== null) {
      return this.parentSymbolTable.getSymbol(token, nodeType, level + 1);
    }

    throw new PascalError(token, "can't find symbol");
  };

  // Returns a SymbolLookup object for the type name. If the name is not
  // found in this table, the parent table is consulted if it's set. Throws
  // if not found. The "level" parameter is for internal use and should be left out.
  SymbolTable.prototype.getType = function (token, level) {
    var name = token.tokenValue.toLowerCase();

    // Default to zero.
    level = level || 0;

    if (this.types.hasOwnProperty(name)) {
      var symbol = this.types[name];
      return new SymbolLookup(symbol, level);
    }

    if (this.parentSymbolTable !== null) {
      return this.parentSymbolTable.getType(token, level + 1);
    }

    throw new PascalError(token, "unknown type");
  };

  // Add a native constant to the symbol table.
  SymbolTable.prototype.addNativeConstant = function (name, value, type) {
    var valueNode;
    switch (type.getSimpleTypeCode()) {
      case defs.A:
        valueNode = Node.makePointerNode(value);
        break;
      case defs.B:
        valueNode = Node.makeBooleanNode(value);
        break;
      default:
        valueNode = Node.makeNumberNode(value);
        break;
    }
    valueNode.expressionType = type;

    var symbol = this.addSymbol(name, Node.CONST, type);
    symbol.value = valueNode;
  };

  // Add a native function to the symbol table.
  SymbolTable.prototype.addNativeFunction = function (name, returnType, parameterTypes, fn) {
    // Add to table of builtins first (for CSP call).
    var nativeProcedure = new NativeProcedure(name, returnType, parameterTypes, fn);
    var index = this.native.add(nativeProcedure);

    // Function that takes a type and an index and returns a PARAMETER for it.
    var makeParameter = function (type, index) {
      var name = Node.makeIdentifierNode(String.fromCharCode(97 + index)); // "a", "b", ...
      return new Node(Node.PARAMETER, null, {
        name: name,
        type: type
      });
    };

    // Make function type.
    var type = new Node(Node.SUBPROGRAM_TYPE, null, {
      parameters: _.map(parameterTypes, makeParameter),
      returnType: returnType
    });

    // Add to this symbol table.
    var symbol = this.addSymbol(name, Node.SUBPROGRAM_TYPE, type);

    // Remember the native index.
    symbol.address = index;

    // Mark it as native.
    symbol.isNative = true;

    return symbol;
  };

  // Add a native type (such as "integer") to the symbol table.
  SymbolTable.prototype.addNativeType = function (name, type) {
    // Nothing special here, it's just like a user-defined type.
    this.addType(name, type);
  };

  // Create a default symbol table with all built-in symbols.
  SymbolTable.makeBuiltinSymbolTable = function () {
    var symbolTable = new SymbolTable(null);

    builtin.importSymbols(symbolTable);

    return symbolTable;
  };

  var Parser = function (lexer) {
    this.lexer = lexer;
  };

  // Parse an entire Pascal program.
  Parser.prototype.parse = function (symbolTable) {
    var node = this._parseSubprogramDeclaration(symbolTable, Node.PROGRAM);

    return node;
  };

  // Returns whether there are more entities to come. The function is given
  // two symbols, one that's a separator and one's that a terminator. Returns
  // true and eats the symbol if it sees the separator; returns false and
  // leaves the symbol if it sees the terminator. Throws if it sees anything else.
  Parser.prototype._moreToCome = function (separator, terminator) {
    var token = this.lexer.lookAhead();
    if (token.isSymbol(separator)) {
      // More to come. Eat the separator.
      this.lexer.next();
      return true;
    } else if (token.isSymbol(terminator)) {
      // We're done. Leave the terminator.
      return false;
    } else {
      throw new PascalError(token, "expected \"" + separator +
        "\" or \"" + terminator + "\"");
    }
  };

  // Eats the next symbol. If it's not this reserved word, raises an error with this
  // message. Returns the token.
  Parser.prototype._expectReservedWord = function (reservedWord, message) {
    var token = this.lexer.next();
    message = message || ("expected reserved word \"" + reservedWord + "\"");
    if (!token.isReserved(reservedWord)) {
      throw new PascalError(token, message);
    }
    return token;
  };

  // Eats the next symbol (such as ":="). If it's not this symbol, raises an
  // error with this message. Returns the token.
  Parser.prototype._expectSymbol = function (symbol, message) {
    var token = this.lexer.next();
    if (token.tokenType !== Token.T_SYMBOL || token.tokenValue !== symbol) {
      message = message || ("expected symbol \"" + symbol + "\"");
      throw new PascalError(token, message);
    }
    return token;
  };

  // Eats the next symbol. If it's not an identifier, raises an error with this
  // message. Returns the identifier token.
  Parser.prototype._expectIdentifier = function (message) {
    var token = this.lexer.next();
    if (token.tokenType !== Token.T_IDENTIFIER) {
      throw new PascalError(token, message);
    }
    return token;
  };

  // Returns a list of declarations (var, etc.).
  Parser.prototype._parseDeclarations = function (symbolTable) {
    var declarations = [];

    // Parse each declaration or block.
    while (!this.lexer.lookAhead().isReserved("begin")) {
      // This parser also eats the semicolon after the declaration.
      var nodes = this._parseDeclaration(symbolTable);

      // Extend the declarations array with the nodes array.
      declarations.push.apply(declarations, nodes);
    }

    return declarations;
  }

  // Parse any declaration (uses, var, procedure, function). Returns a list
  // of them, in case a declaration expands to be multiple nodes.
  Parser.prototype._parseDeclaration = function (symbolTable) {
    var token = this.lexer.lookAhead();

    if (token.isReserved("uses")) {
      return this._parseUsesDeclaration(symbolTable);
    } else if (token.isReserved("var")) {
      this._expectReservedWord("var");
      return this._parseVarDeclaration(symbolTable);
    } else if (token.isReserved("const")) {
      this._expectReservedWord("const");
      return this._parseConstDeclaration(symbolTable);
    } else if (token.isReserved("type")) {
      this._expectReservedWord("type");
      return this._parseTypeDeclaration(symbolTable);
    } else if (token.isReserved("procedure")) {
      return [this._parseSubprogramDeclaration(symbolTable, Node.PROCEDURE)];
    } else if (token.isReserved("function")) {
      return [this._parseSubprogramDeclaration(symbolTable, Node.FUNCTION)];
    } else if (token.tokenType === Token.T_EOF) {
      throw new PascalError(token, "unexpected end of file");
    } else {
      throw new PascalError(token, "unexpected token");
    }
  };

  // Parse "uses" declaration, which is a list of identifiers. Returns a list of nodes.
  Parser.prototype._parseUsesDeclaration = function (symbolTable) {
    var usesToken = this._expectReservedWord("uses");

    var nodes = [];

    do {
      var token = this._expectIdentifier("expected module name");
      var node = new Node(Node.USES, usesToken, {
        name: new Node(Node.IDENTIFIER, token)
      });
      console.log(token.tokenValue);

      // Import the module's symbols into this symbol table.
      //modules.importModule(token.tokenValue, symbolTable);

      nodes.push(node);
    } while (this._moreToCome(",", ";"));

    this._expectSymbol(";");

    return nodes;
  };

  // Parse "var" declaration, which is a variable and its type. Returns a list of nodes.
  Parser.prototype._parseVarDeclaration = function (symbolTable) {
    var nodes = [];

    do {
      var startNode = nodes.length;

      do {
        var nameToken = this._expectIdentifier("expected variable name");
        var node = new Node(Node.VAR, null, {
          name: new Node(Node.IDENTIFIER, nameToken)
        });
        nodes.push(node);
      } while (this._moreToCome(",", ":"));

      // Skip colon.
      this._expectSymbol(":");

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
      this._expectSymbol(";");

      // If the next token is an identifier, then we keep going.
    } while (this.lexer.lookAhead().tokenType === Token.T_IDENTIFIER);

    return nodes;
  };

  // Parse "const" declaration, which is an identifier, optional type, and
  // required value. Returns an array of nodes.
  Parser.prototype._parseConstDeclaration = function (symbolTable) {
    var nodes = [];

    do {
      // Parse the constant name.
      var token = this._expectIdentifier("expected constant name");
      var identifierNode = new Node(Node.IDENTIFIER, token);

      // Parse optional type.
      var type = null;
      token = this.lexer.lookAhead();
      if (token.isSymbol(":")) {
        this.lexer.next();
        type = this._parseType(symbolTable);
      }

      // Parse value. How we do this depends on whether it's a typed constant,
      // and if it is, what kind.
      this._expectSymbol("=");

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
          rawData = this._parseArrayConstant(symbolTable, type);
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
      this._expectSymbol(";");
    } while (this.lexer.lookAhead().tokenType === Token.T_IDENTIFIER);

    return nodes;
  };

  // Parse an array constant, which is a parenthesized list of constants. These
  // can be nested for multi-dimensional arrays. Returns a RawData object.
  Parser.prototype._parseArrayConstant = function (symbolTable, type) {
    // The raw linear (in-memory) version of the data.
    var rawData = new RawData();

    // Recursive function to parse a dimension of the array. The first
    // dimension (ranges[0]) is the "major" one, and we recurse until
    // the last dimension, where we actually parse the constant
    // expressions.
    var self = this;
    var parseDimension = function (d) {
      self._expectSymbol("(");

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
          self._expectSymbol(",");
        }
      }

      self._expectSymbol(")");
    };

    // Start the recursion.
    parseDimension(0);

    return rawData;
  };

  // Parse "type" declaration, which is an identifier and a type. Returns an
  // array of nodes.
  Parser.prototype._parseTypeDeclaration = function (symbolTable) {
    var nodes = [];

    // Pointer types are permitted to point to an undefined type name, as long as
    // that name is defined by the end of the "type" section. We keep track of these
    // here and resolve them at the end.
    var incompleteTypes = [];

    do {
      // Parse identifier.
      var token = this._expectIdentifier("expected type name");
      var identifierNode = new Node(Node.IDENTIFIER, token);

      // Required equal sign.
      var equalToken = this._expectSymbol("=");

      // Parse type.
      var type = this._parseType(symbolTable, incompleteTypes);

      // Create the node.
      var node = new Node(Node.TYPE, equalToken, {
        name: identifierNode,
        type: type,
      });

      // Add the type to our own symbol table.
      node.symbol = symbolTable.addType(identifierNode.token.tokenValue, type);
      nodes.push(node);

      // Semicolon terminator.
      this._expectSymbol(";");
    } while (this.lexer.lookAhead().tokenType === Token.T_IDENTIFIER);

    // Fill in incomplete types. They're required to be defined by the end of
    // the "type" block.
    for (var i = 0; i < incompleteTypes.length; i++) {
      var node = incompleteTypes[i];

      node.type = symbolTable.getType(node.typeName.token).symbol.type;
    }

    return nodes;
  };

  // Parse procedure, function, or program declaration.
  Parser.prototype._parseSubprogramDeclaration = function (symbolTable, nodeType) {
    // Get the string like "procedure", etc.
    var declType = Node.nodeLabel[nodeType];

    // Parse the opening token.
    var procedureToken = this._expectReservedWord(declType);

    // Parse the name.
    var nameToken = this._expectIdentifier("expected " + declType + " name");

    // From now on we're in our own table.
    var symbolTable = new SymbolTable(symbolTable);

    // Parse the parameters.
    var token = this.lexer.lookAhead();
    var parameters = [];
    if (token.isSymbol("(")) {
      this._expectSymbol("(");

      var start = 0;
      do {
        var byReference = false;

        // See if we're passing this batch by reference.
        if (this.lexer.lookAhead().isReserved("var")) {
          this._expectReservedWord("var");
          byReference = true;
        }

        // Parameters can be batched by type.
        do {
          token = this._expectIdentifier("expected parameter name");
          parameters.push(new Node(Node.PARAMETER, colon, {
            name: new Node(Node.IDENTIFIER, token),
            byReference: byReference
          }));
        } while (this._moreToCome(",", ":"));
        var colon = this._expectSymbol(":");

        // Add the type to each parameter.
        var type = this._parseType(symbolTable);
        for (var i = start; i < parameters.length; i++) {
          parameters[i].type = type;
        }
        start = parameters.length;
      } while (this._moreToCome(";", ")"));

      this._expectSymbol(")");
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
      this._expectSymbol(":");
      returnType = this._parseType(symbolTable);
    } else {
      returnType = Node.voidType;
    }
    this._expectSymbol(";");

    // Functions have an additional fake symbol: their own name, which maps
    // to the mark pointer location (return value).
    if (nodeType === Node.FUNCTION) {
      var name = nameToken.tokenValue;
      symbolTable.symbols[name.toLowerCase()] = new Symbol(name, returnType, 0, false);
    }

    // Create the type of the subprogram itself.
    var type = new Node(Node.SUBPROGRAM_TYPE, procedureToken, {
      parameters: parameters,
      returnType: returnType,
    });

    // Add the procedure to our parent symbol table.
    var symbol = symbolTable.parentSymbolTable.addSymbol(nameToken.tokenValue,
      Node.SUBPROGRAM_TYPE, type);

    // Parse declarations.
    var declarations = this._parseDeclarations(symbolTable);

    // Parse begin/end block.
    var block = this._parseBlock(symbolTable, "begin", "end");

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
    this._expectSymbol(nodeType === Node.PROGRAM ? "." : ";");

    return node;
  };

  // Parse a begin/end block. The startWord must be the next token. The endWord
  // will end the block and is eaten.
  Parser.prototype._parseBlock = function (symbolTable, startWord, endWord) {
    var token = this._expectReservedWord(startWord);
    var statements = [];

    var foundEnd = false;
    while (!foundEnd) {
      token = this.lexer.lookAhead();
      if (token.isReserved(endWord)) {
        // End of block.
        this.lexer.next();
        foundEnd = true;
      } else if (token.isSymbol(";")) {
        // Empty statement.
        this.lexer.next();
      } else {
        // Parse statement.
        statements.push(this._parseStatement(symbolTable));

        // After an actual statement, we require a semicolon or end of block.
        token = this.lexer.lookAhead();
        if (!token.isReserved(endWord) && !token.isSymbol(";")) {
          throw new PascalError(token, "expected \";\" or \"" + endWord + "\"");
        }
      }
    }

    return new Node(Node.BLOCK, token, {
      statements: statements
    });
  };

  // Parse a statement, such as a for loop, while loop, assignment, or procedure call.
  Parser.prototype._parseStatement = function (symbolTable) {
    var token = this.lexer.lookAhead();
    var node;

    // Handle simple constructs.
    if (token.isReserved("if")) {
      node = this._parseIfStatement(symbolTable);
    } else if (token.isReserved("while")) {
      node = this._parseWhileStatement(symbolTable);
    } else if (token.isReserved("repeat")) {
      node = this._parseRepeatStatement(symbolTable);
    } else if (token.isReserved("for")) {
      node = this._parseForStatement(symbolTable);
    } else if (token.isReserved("begin")) {
      node = this._parseBlock(symbolTable, "begin", "end");
    } else if (token.isReserved("exit")) {
      node = this._parseExitStatement(symbolTable);
    } else if (token.tokenType === Token.T_IDENTIFIER) {
      // This could be an assignment or procedure call. Both start with an identifier.
      node = this._parseVariable(symbolTable);

      // See if this is an assignment or procedure call.
      token = this.lexer.lookAhead();
      if (token.isSymbol(":=")) {
        // It's an assignment.
        node = this._parseAssignment(symbolTable, node);
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

  // Parse a variable. A variable isn't just an identifier, like "foo", it can also
  // be an array dereference, like "variable[index]", a field designator, like
  // "variable.fieldName", or a pointer dereference, like "variable^". In all
  // three cases the "variable" part is itself a variable. This function always
  // returns a node of type IDENTIFIER, ARRAY, FIELD_DESIGNATOR, or DEREFERENCE.
  Parser.prototype._parseVariable = function (symbolTable) {
    // Variables always start with an identifier.
    var identifierToken = this._expectIdentifier("expected identifier");

    // Create an identifier node for this token.
    var node = new Node(Node.IDENTIFIER, identifierToken);

    // Look up the symbol so we can set its type.
    var symbolLookup = symbolTable.getSymbol(identifierToken);
    node.symbolLookup = symbolLookup;
    node.expressionType = symbolLookup.symbol.type;

    // The next token determines whether the variable continues or ends here.
    while (true) {
      var nextToken = this.lexer.lookAhead();
      if (nextToken.isSymbol("[")) {
        // Replace the node with an array node.
        node = this._parseArrayDereference(symbolTable, node);
      } else if (nextToken.isSymbol(".")) {
        // Replace the node with a record designator node.
        node = this._parseRecordDesignator(symbolTable, node);
      } else if (nextToken.isSymbol("^")) {
        // Replace the node with a pointer dereference.
        this._expectSymbol("^");
        var variable = node;
        if (!variable.expressionType.isSimpleType(defs.A)) {
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

  // Parse an assignment. We already have the left-hand-side variable.
  Parser.prototype._parseAssignment = function (symbolTable, variable) {
    var assignToken = this._expectSymbol(":=");

    var expression = this._parseExpression(symbolTable);
    return new Node(Node.ASSIGNMENT, assignToken, {
      lhs: variable,
      rhs: expression.castToType(variable.expressionType)
    });
  };

  // Parse a procedure call. We already have the identifier, so we only need to
  // parse the optional arguments.
  Parser.prototype._parseProcedureCall = function (symbolTable, identifier) {
    // Look up the symbol to make sure it's a procedure.
    var symbolLookup = symbolTable.getSymbol(identifier.token);
    var symbol = symbolLookup.symbol;
    identifier.symbolLookup = symbolLookup;

    // Verify that it's a procedure.
    if (symbol.type.nodeType === Node.SUBPROGRAM_TYPE && symbol.type.returnType.isVoidType()) {
      // Parse optional arguments.
      var argumentList = this._parseArguments(symbolTable, symbol.type);

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

  // Parse an optional argument list. Returns a list of nodes. type is the
  // type of the subprogram being called.
  Parser.prototype._parseArguments = function (symbolTable, type) {
    var argumentList = [];

    if (this.lexer.lookAhead().isSymbol("(")) {
      this._expectSymbol("(");
      var token = this.lexer.lookAhead();
      if (token.isSymbol(")")) {
        // Empty arguments.
        this.lexer.next();
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
            argument = this._parseVariable(symbolTable);

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
        } while (this._moreToCome(",", ")"));
        this._expectSymbol(")");
      }
    }

    return argumentList;
  }

  // Parse an if statement.
  Parser.prototype._parseIfStatement = function (symbolTable) {
    var token = this._expectReservedWord("if");

    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(expression.token, "if condition must be a boolean");
    }

    this._expectReservedWord("then");
    var thenStatement = this._parseStatement(symbolTable);

    var elseStatement = null;
    var elseToken = this.lexer.lookAhead();
    if (elseToken.isReserved("else")) {
      this._expectReservedWord("else");
      var elseStatement = this._parseStatement(symbolTable);
    }

    return new Node(Node.IF, token, {
      expression: expression,
      thenStatement: thenStatement,
      elseStatement: elseStatement
    });
  };

  // Parse a while statement.
  Parser.prototype._parseWhileStatement = function (symbolTable) {
    var whileToken = this._expectReservedWord("while");

    // Parse the expression that keeps the loop going.
    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(whileToken, "while condition must be a boolean");
    }

    // The "do" keyword is required.
    this._expectReservedWord("do", "expected \"do\" for \"while\" loop");

    // Parse the statement. This can be a begin/end pair.
    var statement = this._parseStatement(symbolTable);

    // Create the node.
    return new Node(Node.WHILE, whileToken, {
      expression: expression,
      statement: statement
    });
  };

  // Parse a repeat/until statement.
  Parser.prototype._parseRepeatStatement = function (symbolTable) {
    var block = this._parseBlock(symbolTable, "repeat", "until");
    var expression = this._parseExpression(symbolTable);
    if (!expression.expressionType.isBooleanType()) {
      throw new PascalError(node.token, "repeat condition must be a boolean");
    }

    return new Node(Node.REPEAT, block.token, {
      block: block,
      expression: expression
    });
  };

  // Parse a for statement.
  Parser.prototype._parseForStatement = function (symbolTable) {
    var token = this._expectReservedWord("for");

    var loopVariableToken = this._expectIdentifier("expected identifier for \"for\" loop");
    this._expectSymbol(":=");
    var fromExpr = this._parseExpression(symbolTable);
    var downto = this.lexer.lookAhead().isReserved("downto");
    if (downto) {
      this._expectReservedWord("downto");
    } else {
      // Default error message if it's neither.
      this._expectReservedWord("to");
    }
    var toExpr = this._parseExpression(symbolTable);
    this._expectReservedWord("do");
    var body = this._parseStatement(symbolTable);

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

  // Parse an exit statement.
  Parser.prototype._parseExitStatement = function (symbolTable) {
    var token = this._expectReservedWord("exit");

    return new Node(Node.EXIT, token);
  };

  // Parse a type declaration, such as "Integer" or "Array[1..70] of Real".
  // The "incompleteTypes" array is optional. If specified, and if a pointer
  // to an unknown type is found, it is added to the array. If such a pointer
  // is found and the array was not passed in, we throw.
  Parser.prototype._parseType = function (symbolTable, incompleteTypes) {
    var token = this.lexer.next();
    var node;

    if (token.isReserved("array")) {
      // Array type.
      this._expectSymbol("[");
      var ranges = [];
      // Parse multiple ranges.
      do {
        var range = this._parseRange(symbolTable);
        ranges.push(range);
      } while (this._moreToCome(",", "]"));
      this._expectSymbol("]");
      this._expectReservedWord("of");
      var elementType = this._parseType(symbolTable, incompleteTypes);

      node = new Node(Node.ARRAY_TYPE, token, {
        elementType: elementType,
        ranges: ranges
      });
    } else if (token.isReserved("record")) {
      node = this._parseRecordType(symbolTable, token, incompleteTypes);
    } else if (token.isSymbol("^")) {
      var typeNameToken = this._expectIdentifier("expected type identifier");
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
        typeCode: defs.A,
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
    } else if (token.tokenType === Token.T_IDENTIFIER) {
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

  // Parse a record type definition. See _parseType() for an explanation of "incompleteTypes".
  Parser.prototype._parseRecordType = function (symbolTable, token, incompleteTypes) {
    // A record is a list of fields.
    var fields = [];

    while (true) {
      var token = this.lexer.lookAhead();
      if (token.isSymbol(";")) {
        // Empty field, no problem.
        this.lexer.next();
      } else if (token.isReserved("end")) {
        // End of record.
        this._expectReservedWord("end");
        break;
      } else {
        fields.push.apply(fields,
          this._parseRecordSection(symbolTable, token, incompleteTypes));
        // Must have ";" or "end" after field.
        var token = this.lexer.lookAhead();
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

  // Parse a section of a record type, which is a list of identifiers and
  // their type. Returns an array of FIELD nodes. See _parseType() for an
  // explanation of "incompleteTypes".
  Parser.prototype._parseRecordSection = function (symbolTable, fieldToken, incompleteTypes) {
    var fields = [];

    do {
      var nameToken = this._expectIdentifier("expected field name");
      var field = new Node(Node.FIELD, fieldToken, {
        name: new Node(Node.IDENTIFIER, nameToken),
        offset: 0
      });
      fields.push(field);
    } while (this._moreToCome(",", ":"));

    // Skip colon.
    this._expectSymbol(":");

    // Parse the fields's type.
    var type = this._parseType(symbolTable, incompleteTypes);

    // Set the type of all fields.
    for (var i = 0; i < fields.length; i++) {
      fields[i].type = type;
    }

    return fields;
  };

  // Parses a range, such as "5..10". Either can be a constant expression.
  Parser.prototype._parseRange = function (symbolTable) {
    var low = this._parseExpression(symbolTable);
    var token = this._expectSymbol("..");
    var high = this._parseExpression(symbolTable);

    return new Node(Node.RANGE, token, {low: low, high: high});
  };

  // Parses an expression.
  Parser.prototype._parseExpression = function (symbolTable) {
    return this._parseRelationalExpression(symbolTable);
  };

  // Parses a relational expression.
  Parser.prototype._parseRelationalExpression = function (symbolTable) {
    var node = this._parseAdditiveExpression(symbolTable);

    while (true) {
      var token = this.lexer.lookAhead();
      if (token.isSymbol("=")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.EQUALITY,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<>")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.INEQUALITY,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol(">")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.GREATER_THAN,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.LESS_THAN,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol(">=")) {
        node = this._createBinaryNode(symbolTable, token, node,
          Node.GREATER_THAN_OR_EQUAL_TO,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else if (token.isSymbol("<=")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.LESS_THAN_OR_EQUAL_TO,
          this._parseAdditiveExpression).withExpressionType(Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  // Parses an additive expression.
  Parser.prototype._parseAdditiveExpression = function (symbolTable) {
    var node = this._parseMultiplicativeExpression(symbolTable);

    while (true) {
      var token = this.lexer.lookAhead();
      if (token.isSymbol("+")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.ADDITION,
          this._parseMultiplicativeExpression);
      } else if (token.isSymbol("-")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.SUBTRACTION,
          this._parseMultiplicativeExpression);
      } else if (token.isReserved("or")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.OR,
          this._parseMultiplicativeExpression,
          Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  // Parses a multiplicative expression.
  Parser.prototype._parseMultiplicativeExpression = function (symbolTable) {
    var node = this._parseUnaryExpression(symbolTable);

    while (true) {
      var token = this.lexer.lookAhead();
      if (token.isSymbol("*")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.MULTIPLICATION,
          this._parseUnaryExpression);
      } else if (token.isSymbol("/")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.DIVISION,
          this._parseUnaryExpression, Node.realType);
      } else if (token.isReserved("div")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.INTEGER_DIVISION,
          this._parseUnaryExpression, Node.integerType);
      } else if (token.isReserved("mod")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.MOD,
          this._parseUnaryExpression, Node.integerType);
      } else if (token.isReserved("and")) {
        node = this._createBinaryNode(symbolTable, token, node, Node.AND,
          this._parseUnaryExpression, Node.booleanType);
      } else {
        break;
      }
    }

    return node;
  };

  // Parses a unary expression, such as a negative sign or a "not".
  Parser.prototype._parseUnaryExpression = function (symbolTable) {
    var node;

    // Parse unary operator.
    var token = this.lexer.lookAhead();
    if (token.isSymbol("-")) {
      // Negation.
      this._expectSymbol("-");

      var expression = this._parseUnaryExpression(symbolTable);
      node = new Node(Node.NEGATIVE, token, {
        expression: expression
      }).withExpressionTypeFrom(expression);
    } else if (token.isSymbol("+")) {
      // Unary plus.
      this._expectSymbol("+");

      // Nothing to wrap sub-expression with.
      node = this._parseUnaryExpression(symbolTable);
    } else if (token.isReserved("not")) {
      // Logical not.
      this._expectReservedWord("not");

      var expression = this._parseUnaryExpression(symbolTable);
      if (!expression.expressionType.isBooleanType()) {
        throw new PascalError(expression.token, "not operand must be a boolean");
      }
      node = new Node(Node.NOT, token, {
        expression:expression
      }).withExpressionTypeFrom(expression);
    } else {
      node = this._parsePrimaryExpression(symbolTable);
    }

    return node;
  };

  // Parses an atomic expression, such as a number, identifier, or
  // parenthesized expression.
  Parser.prototype._parsePrimaryExpression = function (symbolTable) {
    var token = this.lexer.lookAhead();
    var node;

    if (token.tokenType === Token.T_NUMBER) {
      // Numeric literal.
      token = this.lexer.next();
      node = new Node(Node.T_NUMBER, token);
      var v = node.getNumber();
      var typeCode;

      // See if we're an integer or real.
      if ((v | 0) === v) {
        typeCode = defs.I;
      } else {
        typeCode = defs.R;
      }

      // Set the type based on the kind of number we have. Really we should
      // have the lexer tell us, because JavaScript treats "2.0" the same as "2".
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: typeCode
      });
    } else if (token.tokenType === Token.T_STRING) {
      // String literal.
      token = this.lexer.next();
      node = new Node(Node.T_STRING, token);
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: defs.S
      });
    } else if (token.tokenType === Token.T_IDENTIFIER) {
      // Parse a variable (identifier, array dereference, etc.).
      node = this._parseVariable(symbolTable);

      // What we do next depends on the variable. If it's just an identifier,
      // then it could be a function call, a function call with arguments,
      // a constant, or a plain variable. We handle all these cases. If it's
      // not just an identifier, then we leave it alone.
      if (node.nodeType === Node.IDENTIFIER) {
        // Peek to see if we've got parentheses.
        var nextToken = this.lexer.lookAhead();

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
            argumentList: this._parseArguments(symbolTable, symbol.type)
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
      this._expectSymbol("(");
      node = this._parseExpression(symbolTable);
      this._expectSymbol(")");
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

      this._expectSymbol("@");
      var variable = this._parseVariable(symbolTable);
      node = new Node(Node.ADDRESS_OF, token, {
        variable: variable
      });
      node.expressionType = new Node(Node.SIMPLE_TYPE, token, {
        typeCode: defs.A,
        typeName: "AD-HOC",
        type: variable.expressionType
      });
    } else {
      throw new PascalError(token, "expected expression");
    }

    return node;
  };

  // Parse an array dereference, such as "a[2,3+4]".
  Parser.prototype._parseArrayDereference = function (symbolTable, variable) {
    // Make sure the variable is an array.
    if (variable.expressionType.nodeType !== Node.ARRAY_TYPE) {
      throw new PascalError(variable.token, "expected an array type");
    }

    var arrayToken = this._expectSymbol("[");
    var indices = [];
    do {
      // Indices must be integers.
      indices.push(this._parseExpression(symbolTable).castToType(Node.integerType));
    } while (this._moreToCome(",", "]"));
    this._expectSymbol("]");

    var array = new Node(Node.ARRAY, arrayToken, {
      variable: variable,
      indices: indices
    });

    // The type of the array lookup is the type of the array element.
    array.expressionType = variable.expressionType.elementType;

    return array;
  };

  // Parse a record designator, such as "a.b".
  Parser.prototype._parseRecordDesignator = function (symbolTable, variable) {
    // Make sure the variable so far is a record.
    var recordType = variable.expressionType;
    if (recordType.nodeType !== Node.RECORD_TYPE) {
      throw new PascalError(nextToken, "expected a record type");
    }

    var dotToken = this._expectSymbol(".", "expected a dot");

    // Parse the field name.
    var fieldToken = this._expectIdentifier("expected a field name");

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

  // Creates a binary node.
  //
  // token: the specific token, which must be next in the lexer.
  // node: the first (left) operand.
  // nodeType: the type of the binary node (Node.ADDITION, etc.).
  // rhsFn: the function to call to parse the RHS. It should take a symbolTable object
  //      and return an expression node.
  // forceType: optional type node (e.g., Node.realType). Both operands will be cast
  //      naturally to this type and the node will be of this type.
  Parser.prototype._createBinaryNode = function (symbolTable, token, node,
                                                 nodeType, rhsFn, forceType) {

    // It must be next, we've only peeked at it.
    if (token.tokenType === Token.T_SYMBOL) {
      this._expectSymbol(token.tokenValue);
    } else {
      this._expectReservedWord(token.tokenValue);
    }

    var operand1 = node;
    var operand2 = rhsFn.apply(this, [symbolTable]);

    var expressionType;
    if (forceType) {
      // Use what's passed in.
      expressionType = forceType;
    } else {
      // Figure it out from the operands.
      expressionType = this._getCompatibleType(token,
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

  // Returns a type compatible for both operands. For example, if one is
  // integer and another is real, returns a real, since you can implicitly
  // cast from integer to real. Throws if a compatible type can't
  // be found. Token is passed in just for error reporting.
  Parser.prototype._getCompatibleType = function (token, type1, type2) {
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
      throw new PascalError(token, "basic types are incompatible: " +
        type1.print() + " and " + type2.print());
    }

    // Can cast between some simple types.
    if (type1.nodeType === Node.SIMPLE_TYPE &&
      type1.typeCode !== type2.typeCode) {

      // They're different.
      var typeCode1 = type1.typeCode;
      var typeCode2 = type2.typeCode;

      if (typeCode1 === defs.A || typeCode2 === defs.A ||
        typeCode1 === defs.B || typeCode2 === defs.B ||
        typeCode1 === defs.S || typeCode2 === defs.S ||
        typeCode1 === defs.T || typeCode2 === defs.T ||
        typeCode1 === defs.P || typeCode2 === defs.P ||
        typeCode1 === defs.X || typeCode2 === defs.X) {

        // These can't be cast.
        throw new PascalError(token, "no common type between " +
          defs.typeCodeToName(typeCode1) +
          " and " + defs.typeCodeToName(typeCode2));
      }

      // Can always cast to a real.
      if (typeCode1 === defs.R) {
        return type1;
      } else if (typeCode2 === defs.R) {
        return type2;
      }

      // Otherwise can cast to an integer.
      if (typeCode1 === defs.I) {
        return type1;
      } else if (typeCode2 === defs.I) {
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

  var Machine = function (bytecode, keyboard) {
    this.bytecode = bytecode;
    this.keyboard = keyboard;

    // Time that the program was started, in ms since epoch.
    this.startTime = 0;

    // Data store. Used for the stack, which grows up from address 0.
    this.dstore = new Array(65536);

    // Program counter. Points into the istore of the bytecode.
    this.pc = 0;

    // Stack Pointer. Points into the dstore. The specifications for the
    // p-machine say that SP points to the top-most item on the stack (the
    // item most recently pushed), but here we point one past that. I'm too
    // used to the latter convention and it would cause too many bugs for
    // me to switch. Besides, other docs imply that the p-machine used my
    // convention anyway, so I can't be sure.
    this.sp = 0;

    // Mark Pointer. Points into the dstore. Points to the bottom of the
    // stack frame.
    this.mp = 0;

    // New Pointer. Points into the dstore. Points to the bottom of the heap,
    // the lowest address within the heap.
    this.np = 0;

    // Extreme Pointer. Points to the highest stack address used by the
    // currently-executing procedure. This is an optimization so that
    // we only need to check in one place (when EP is increased) whether
    // we've crashed into the New Pointer. We don't use this.
    this.ep = 0;

    // The state of the machine (STATE_...).
    this.state = Machine.STATE_STOPPED;

    // Debug callback. Can be called with a string that should be displayed to
    // the user.
    this.debugCallback = null;

    // Finish callback. Called when the program terminates, either by running off
    // the end of the program's begin/end block, or by calling halt. The callback
    // is passed the number of seconds that the program ran.
    this.finishCallback = null;

    // Callback that standard output is sent to. This is called once per
    // line of output, and the line is the only parameter.
    this.outputCallback = null;

    // The number of ms that the program is expecting us to delay now.
    this.pendingDelay = 0;

    // Control object for native functions to manipulate this machine.
    var self = this;
    this.control = {
      stop: function () {
        self.stopProgram();
      },
      delay: function (ms) {
        self.pendingDelay = ms;
      },
      writeln: function (line) {
        if (self.outputCallback !== null) {
          self.outputCallback(line);
        }
      },
      readDstore: function (address) {
        return self.dstore[address];
      },
      writeDstore: function (address, value) {
        self.dstore[address] = value;
      },
      malloc: function (size) {
        return self._malloc(size);
      },
      free: function (p) {
        return self._free(p);
      },
      keyPressed: function () {
        if (self.keyboard) {
          return self.keyboard.keyPressed();
        } else {
          return false;
        }
      },
      readKey: function () {
        if (self.keyboard) {
          return self.keyboard.readKey();
        } else {
          return 0;
        }
      }
    };
  };

  // Various machine states.
  Machine.STATE_STOPPED = 0;
  Machine.STATE_RUNNING = 1;

  // Run the bytecode.
  Machine.prototype.run = function () {
    // Reset the machine.
    this._reset();

    // Start the machine.
    this.state = Machine.STATE_RUNNING;
    this.startTime = new Date().getTime();

    // Run the program.
    this._dumpState();

    var self = this;
    var stepAndTimeout = function () {
      self.step(100000);
      if (self.state === Machine.STATE_RUNNING) {
        var delay = self.pendingDelay;
        self.pendingDelay = 0;
        setTimeout(stepAndTimeout, delay);
      }
    };
    stepAndTimeout();
  };

  // Step "count" instructions. Does nothing if the program is stopped.
  Machine.prototype.step = function (count) {
    for (var i = 0; i < count && this.state === Machine.STATE_RUNNING &&
      this.pendingDelay === 0; i++) {

      try {
        this._executeInstruction();
      } catch (e) {
        if (e instanceof PascalError) {
          console.log(e.getMessage());
        }
        console.log(e.stack);
        console.log(this._getState());
        this.stopProgram();
      }
      this._dumpState();
    }
  };

  // Set a callback for debugging. The callback is called with a string that should
  // be displayed to the user.
  Machine.prototype.setDebugCallback = function (debugCallback) {
    this.debugCallback = debugCallback;
  };

  // Set a callback for when the program ends. The callback is called with a number for
  // the number of seconds that the program ran.
  Machine.prototype.setFinishCallback = function (finishCallback) {
    this.finishCallback = finishCallback;
  };

  // Set a callback for standard output. The callback is called with a string to
  // write.
  Machine.prototype.setOutputCallback = function (outputCallback) {
    this.outputCallback = outputCallback;
  };

  // Dump the state of the machine to the debug callback.
  Machine.prototype._dumpState = function () {
    if (this.debugCallback != null) {
      this.debugCallback(this._getState());
    }
  };

  // Generate a string which is a human-readable version of the machine state.
  Machine.prototype._getState = function () {
    // Clip off stack display since it can be very large with arrays.
    var maxStack = 20;
    // Skip typed constants.
    var startStack = this.bytecode.typedConstants.length;
    var clipStack = Math.max(startStack, this.sp - maxStack);
    var stack = JSON.stringify(this.dstore.slice(clipStack, this.sp));
    if (clipStack > startStack) {
      // Trim stack.
      stack = stack[0] + "...," + stack.slice(1, stack.length);
    }

    // Clip off heap display since it can be very large with arrays.
    var maxHeap = 20;
    var heapSize = this.dstore.length - this.np;
    var heapDisplay = Math.min(maxHeap, heapSize);
    var heap = JSON.stringify(this.dstore.slice(
      this.dstore.length - heapDisplay, this.dstore.length));
    if (heapDisplay != heapSize) {
      // Trim heap.
      heap = heap[0] + "...," + heap.slice(1, heap.length);
    }

    var state = [
      "pc = " + rightAlign(this.pc, 4),
      leftAlign(defs.disassemble(this.bytecode.istore[this.pc]), 11),
      /// "sp = " + rightAlign(this.sp, 3),
      "mp = " + rightAlign(this.mp, 3),
      "stack = " + leftAlign(stack, 40),
      "heap = " + heap
    ];

    return state.join(" ");
  }

  // Push a value onto the stack.
  Machine.prototype._push = function (value) {
    // Sanity check.
    if (value === null || value === undefined) {
      throw new PascalError(null, "can't push " + value);
    }
    this.dstore[this.sp++] = value;
  };

  // Pop a value off the stack.
  Machine.prototype._pop = function () {
    --this.sp;
    var value = this.dstore[this.sp];

    // Set it to undefined so we can find bugs more easily.
    this.dstore[this.sp] = undefined;

    return value;
  };

  // Reset the machines state.
  Machine.prototype._reset = function () {
    // Copy the typed constants into the dstore.
    for (var i = 0; i < this.bytecode.typedConstants.length; i++) {
      this.dstore[i] = this.bytecode.typedConstants[i];
    }

    // The bytecode has a specific start address (the main block of the program).
    this.pc = this.bytecode.startAddress;
    this.sp = this.bytecode.typedConstants.length;
    this.mp = 0;
    this.np = this.dstore.length;
    this.ep = 0;
    this.state = Machine.STATE_STOPPED;
  };

  // Get the static link off the mark.
  Machine.prototype._getStaticLink = function (mp) {
    // The static link is the second entry in the mark.
    return this.dstore[mp + 1];
  };

  // Verifies that the data address is valid, meaning that it's in the
  // stack or the heap. Throws if not.
  Machine.prototype._checkDataAddress = function (address) {
    if (address >= this.sp && address < this.np) {
      throw new PascalError(null, "invalid data address (" +
        this.sp + " <= " + address + " < " + this.np + ")");
    }
  };

  // If the program is running, stop it and called the finish callback.
  Machine.prototype.stopProgram = function () {
    if (this.state !== Machine.STATE_STOPPED) {
      this.state = Machine.STATE_STOPPED;
      if (this.finishCallback !== null) {
        this.finishCallback((new Date().getTime() - this.startTime)/1000);
      }
    }
  };

  // Execute the next instruction.
  Machine.prototype._executeInstruction = function () {
    // Get this instruction.
    var pc = this.pc;
    var i = this.bytecode.istore[pc];

    // Advance the PC right away. Various instructions can then modify it.
    this.pc++;

    var opcode = defs.getOpcode(i);
    var operand1 = defs.getOperand1(i);
    var operand2 = defs.getOperand2(i);

    switch (opcode) {
      case defs.CUP:
        // Call User Procedure. By now SP already points past the mark
        // and the parameters. So we set the new MP by backing off all
        // those. Opcode1 is the number of parameters passed in.
        this.mp = this.sp - operand1 - defs.MARK_SIZE;

        // Store the return address.
        this.dstore[this.mp + 4] = this.pc;

        // Jump to the procedure.
        this.pc = operand2;
        break;
      case defs.CSP:
        // Call System Procedure. We look up the index into the Native object
        // and call it.
        var nativeProcedure = this.bytecode.native.get(operand2);

        // Pop parameters.
        var parameters = [];
        for (var i = 0; i < operand1; i++) {
          // They are pushed on the stack first to last, so we
          // unshift them (push them on the front) so they end up in
          // the right order.
          parameters.unshift(this._pop());
        }

        // Push the control object that the native function can use to
        // control this machine.
        parameters.unshift(this.control);

        var returnValue = nativeProcedure.fn.apply(null, parameters);

        // Push result if we're a function.
        if (!nativeProcedure.returnType.isSimpleType(defs.P)) {
          this._push(returnValue);
        }
        break;
      case defs.ENT:
        // Entry. Set SP or EP to MP + operand2, which is the sum of
        // the mark size, the parameters, and all local variables. If
        // we're setting SP, then we're making room for local variables
        // and preparing the SP to do computation.
        var address = this.mp + operand2;
        if (operand1 === 0) {
          // Clear the local variable area.
          for (var i = this.sp; i < address; i++) {
            this.dstore[i] = 0;
          }
          this.sp = address;
        } else {
          this.ep = address;
        }
        break;
      case defs.MST:
        // Follow static links "operand1" times.
        var sl = this.mp;
        for (var i = 0; i < operand1; i++) {
          sl = this._getStaticLink(sl);
        }

        // Mark Stack.
        this._push(0);              // RV, set by called function.
        this._push(sl);             // SL
        this._push(this.mp);        // DL
        this._push(this.ep);        // EP
        this._push(0);              // RA, set by CUP.
        break;
      case defs.RTN:
        // Return.
        var oldMp = this.mp;
        this.mp = this.dstore[oldMp + 2];
        this.ep = this.dstore[oldMp + 3];
        this.pc = this.dstore[oldMp + 4];
        if (operand1 === defs.P) {
          // Procedure, pop off the return value.
          this.sp = oldMp;
        } else {
          // Function, leave the return value on the stack.
          this.sp = oldMp + 1;
        }
        break;
      case defs.EQU:
        // Equal To.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 === op2);
        break;
      case defs.NEQ:
        // Not Equal To.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 !== op2);
        break;
      case defs.GRT:
        // Greater Than.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 > op2);
        break;
      case defs.GEQ:
        // Greater Than Or Equal To.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 >= op2);
        break;
      case defs.LES:
        // Less Than.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 < op2);
        break;
      case defs.LEQ:
        // Less Than Or Equal To.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 <= op2);
        break;
      case defs.ADI:
      case defs.ADR:
        // Add integer/real.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 + op2);
        break;
      case defs.SBI:
      case defs.SBR:
        // Subtract integer/real.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 - op2);
        break;
      case defs.NGI:
      case defs.NGR:
        // Negate.
        this._push(-this._pop());
        break;
      case defs.MPI:
      case defs.MPR:
        // Multiply integer/real.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 * op2);
        break;
      case defs.DVI:
        // Divide integer.
        var op2 = this._pop();
        var op1 = this._pop();
        if (op2 === 0) {
          throw new PascalError(null, "divide by zero");
        }
        this._push(trunc(op1 / op2));
        break;
      case defs.MOD:
        // Modulo.
        var op2 = this._pop();
        var op1 = this._pop();
        if (op2 === 0) {
          throw new PascalError(null, "modulo by zero");
        }
        this._push(op1 % op2);
        break;
      // case defs.ABI:
      // case defs.SQI:
      case defs.INC:
        // Increment.
        this._push(this._pop() + 1);
        break;
      case defs.DEC:
        // Decrement.
        this._push(this._pop() - 1);
        break;
      case defs.DVR:
        // Divide real.
        var op2 = this._pop();
        var op1 = this._pop();
        if (op2 === 0) {
          throw new PascalError(null, "divide by zero");
        }
        this._push(op1 / op2);
        break;
      // case defs.ABR:
      // case defs.SQR:
      case defs.IOR:
        // Inclusive OR.
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 || op2);
        break;
      case defs.AND:
        // AND
        var op2 = this._pop();
        var op1 = this._pop();
        this._push(op1 && op2);
        break;
      // case defs.XOR:
      case defs.NOT:
        this._push(!this._pop());
        break;
      // case defs.INN:
      // case defs.UNI:
      // case defs.INT:
      // case defs.DIF:
      // case defs.CMP:
      // case defs.SGS:
      case defs.UJP:
        this.pc = operand2;
        break;
      case defs.XJP:
        this.pc = this._pop();
        break;
      case defs.FJP:
        if (!this._pop()) {
          this.pc = operand2;
        }
        break;
      case defs.TJP:
        if (this._pop()) {
          this.pc = operand2;
        }
        break;
      case defs.FLT:
        // Cast Integer to Real.
        // Nothing to do, we don't distinguish between integers and real.
        break;
      // case defs.FLO:
      // case defs.TRC:
      // case defs.RND:
      // case defs.CHR:
      // case defs.ORD:
      case defs.STP:
        // Stop.
        this.stopProgram();
        break;
      case defs.LDA:
        // Load Address. Pushes the address of a variable.
        var address = this._computeAddress(operand1, operand2);
        this._push(address);
        break;
      case defs.LDC:
        // Load Constant.
        if (operand1 === defs.I || operand1 === defs.R ||
          operand1 === defs.S || operand1 === defs.A) {

          // Look up the constant in the constant pool.
          this._push(this.bytecode.constants[operand2]);
        } else if (operand1 === defs.B) {
          // Booleans are stored in operand2.
          this._push(!!operand2);
        } else if (operand1 === defs.C) {
          // Characters are stored in operand2.
          this._push(operand2);
        } else {
          throw new PascalError(null, "can't push constant of type " +
            defs.typeCodeToName(operand1));
        }
        break;
      case defs.LDI:
        // Load Indirect.
        var address = this._pop();
        this._checkDataAddress(address);
        this._push(this.dstore[address]);
        break;
      case defs.LVA:
      case defs.LVB:
      case defs.LVC:
      case defs.LVI:
      case defs.LVR:
        // Load Value.
        var address = this._computeAddress(operand1, operand2);
        this._checkDataAddress(address);
        this._push(this.dstore[address]);
        break;
      // case defs.LVS:
      case defs.STI:
        // Store Indirect.
        var value = this._pop();
        var address = this._pop();
        this._checkDataAddress(address);
        this.dstore[address] = value;
        break;
      case defs.IXA:
        // Indexed Address. a = a + index*stride
        var address = this._pop();
        var index = this._pop();
        address += index*operand2;
        this._push(address);
        break;
      default:
        throw new PascalError(null, "don't know how to execute instruction " +
          defs.opcodeToName[opcode]);
    }
  };

  // Given a level and an offset, returns the address in the dstore. The level is
  // the number of static links to dereference.
  Machine.prototype._computeAddress = function (level, offset) {
    var mp = this.mp;

    // Follow static link "level" times.
    for (var i = 0; i < level; i++) {
      mp = this._getStaticLink(mp);
    }

    return mp + offset;
  };

  // Allocate "size" words on the heap and return the new address. Throws if no
  // more heap is available.
  Machine.prototype._malloc = function (size) {
    // Make room for the object.
    this.np -= size;
    var address = this.np;

    // Blank out new allocation.
    for (var i = 0; i < size; i++) {
      this.dstore[address + i] = 0;
    }

    // Store size of allocation one word before the object.
    this.np--;
    this.dstore[this.np] = size;

    return address;
  };

  // Free the block on the heap pointed to by p.
  Machine.prototype._free = function (p) {
    // Get the size. We wrote it in the word before p.
    var size = this.dstore[p - 1];

    if (p === this.np + 1) {
      // This block is at the bottom of the heap. Just reclaim the memory.
      this.np += size + 1;
    } else {
      // Internal node. Not handled.
    }
  };

  var Compiler = function () {
    // This is a stack of lists of addresses of unconditional jumps (UJP) instructions
    // that should go to the end of the function/procedure in an Exit statement.
    // Each outer element represents a nested function/procedure we're compiling.
    // The inner list is an unordered list of addresses to update when we get to
    // the end of the function/procedure and know its last address.
    this.exitInstructions = [];
  };

  // Given a parse tree, return the bytecode object.
  Compiler.prototype.compile = function (root) {
    var bytecode = new Bytecode(root.symbolTable.native);

    // Start at the root and recurse.
    this._generateBytecode(bytecode, root, null);

    // Generate top-level calling code.
    bytecode.setStartAddress();
    bytecode.add(defs.MST, 0, 0, "start of program -----------------");
    bytecode.add(defs.CUP, 0, root.symbol.address, "call main program");
    bytecode.add(defs.STP, 0, 0, "program end");

    return bytecode;
  };

  // Adds the node to the bytecode.
  Compiler.prototype._generateBytecode = function (bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var name = node.token.tokenValue;
        var symbolLookup = node.symbolLookup;
        if (symbolLookup.symbol.byReference) {
          // Symbol is by reference. Must get its address first.
          bytecode.add(defs.LVA, symbolLookup.level,
            symbolLookup.symbol.address, "address of " + name);
          bytecode.add(defs.LDI, symbolLookup.symbol.type.typeCode,
            0, "value of " + name);
        } else {
          // Here we could call _generateAddressBytecode() followed by an defs.LDI,
          // but loading the value directly is more efficient.
          if (symbolLookup.symbol.type.nodeType === Node.SIMPLE_TYPE) {
            var opcode;
            switch (symbolLookup.symbol.type.typeCode) {
              case defs.A:
                opcode = defs.LVA;
                break;
              case defs.B:
                opcode = defs.LVB;
                break;
              case defs.C:
                opcode = defs.LVC;
                break;
              case defs.I:
                opcode = defs.LVI;
                break;
              case defs.R:
                opcode = defs.LVR;
                break;
              default:
                throw new PascalError(node.token, "can't make code to get " +
                  symbolLookup.symbol.type.print());
            }
            bytecode.add(opcode, symbolLookup.level,
              symbolLookup.symbol.address, "value of " + name);
          } else {
            // This is a more complex type, and apparently it's being
            // passed by value, so we push the entire thing onto the stack.
            var size = symbolLookup.symbol.type.getTypeSize();
            // For large parameters it would be more
            // space-efficient (but slower) to have a loop.
            for (var i = 0; i < size; i++) {
              bytecode.add(defs.LVI, symbolLookup.level,
                symbolLookup.symbol.address + i,
                "value of " + name + " at index " + i);
            }
          }
        }
        break;
      case Node.T_NUMBER:
        var v = node.getNumber();
        var cindex = bytecode.addConstant(v);

        // See if we're an integer or real.
        var typeCode;
        if ((v | 0) === v) {
          typeCode = defs.I;
        } else {
          typeCode = defs.R;
        }

        bytecode.add(defs.LDC, typeCode, cindex, "constant value " + v);
        break;
      case Node.T_STRING:
        var v = node.token.tokenValue;
        var cindex = bytecode.addConstant(v);
        bytecode.add(defs.LDC, defs.S, cindex, "string '" + v + "'");
        break;
      case Node.BOOLEAN:
        var v = node.token.tokenValue;
        bytecode.add(defs.LDC, defs.B, node.getBoolean() ? 1 : 0, "boolean " + v);
        break;
      case Node.POINTER:
        // This can only be nil.
        var cindex = bytecode.addConstant(0);
        bytecode.add(defs.LDC, defs.A, cindex, "nil pointer");
        break;
      case Node.PROGRAM:
      case Node.PROCEDURE:
      case Node.FUNCTION:
        var isFunction = node.nodeType === Node.FUNCTION;
        var name = node.name.token.tokenValue;

        // Begin a new frame for exit statements.
        this._beginExitFrame();

        // Generate each procedure and function.
        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.PROCEDURE ||
            declaration.nodeType === Node.FUNCTION) {

            this._generateBytecode(bytecode, declaration, node.symbolTable);
          }
        }

        // Generate code for entry to block.
        node.symbol.address = bytecode.getNextAddress();
        var frameSize = defs.MARK_SIZE + node.symbolTable.totalVariableSize +
          node.symbolTable.totalParameterSize;
        bytecode.add(defs.ENT, 0, frameSize, "start of " + name + " -----------------");

        // Generate code for typed constants.
        for (var i = 0; i < node.declarations.length; i++) {
          var declaration = node.declarations[i];
          if (declaration.nodeType === Node.TYPED_CONST) {
            this._generateBytecode(bytecode, declaration, node.symbolTable);
          }
        }

        // Generate code for block.
        this._generateBytecode(bytecode, node.block, node.symbolTable);

        // End the frame for exit statements.
        var ujpAddresses = this._endExitFrame();
        var rtnAddress = bytecode.getNextAddress();

        bytecode.add(defs.RTN, isFunction ? node.expressionType.
          returnType.getSimpleTypeCode() : defs.P, 0, "end of " + name);

        // Update all of the UJP statements to point to RTN.
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
        // Nothing.
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
        if (fromType.isSimpleType(defs.I) && toType.isSimpleType(defs.R)) {
          bytecode.add(defs.FLT, 0, 0, "cast to float");
        } else {
          throw new PascalError(node.token, "don't know how to compile a cast from " +
            fromType.print() + " to " + toType.print());
        }
        break;
      case Node.ASSIGNMENT:
        // Push address of LHS onto stack.
        this._generateAddressBytecode(bytecode, node.lhs, symbolTable);

        // Push RHS onto stack.
        this._generateBytecode(bytecode, node.rhs, symbolTable);

        // We don't look at the type code when executing, but might as
        // well set it anyway.
        var storeTypeCode = node.rhs.expressionType.getSimpleTypeCode();

        bytecode.add(defs.STI, storeTypeCode, 0, "store into " + node.lhs.print());
        break;
      case Node.PROCEDURE_CALL:
      case Node.FUNCTION_CALL:
        var isFunction = node.nodeType === Node.FUNCTION_CALL;
        var declType = isFunction ? "function" : "procedure";
        var symbolLookup = node.name.symbolLookup;
        var symbol = symbolLookup.symbol;

        if (!symbol.isNative) {
          bytecode.add(defs.MST, symbolLookup.level, 0, "set up mark for " + declType);
        }

        // Push arguments.
        for (var i = 0; i < node.argumentList.length; i++) {
          var argument = node.argumentList[i];
          if (argument.byReference) {
            this._generateAddressBytecode(bytecode, argument, symbolTable);
          } else {
            this._generateBytecode(bytecode, argument, symbolTable);
          }
        }

        // See if this is a user procedure/function or native procedure/function.
        if (symbol.isNative) {
          // The CSP index is stored in the address field.
          var index = symbol.address;
          bytecode.add(defs.CSP, node.argumentList.length, index,
            "call system " + declType + " " + symbol.name);
        } else {
          // Call procedure/function.
          var parameterSize = symbol.type.getTotalParameterSize();
          bytecode.add(defs.CUP, parameterSize, symbol.address,
            "call " + node.name.print());
        }
        break;
      case Node.REPEAT:
        var topOfLoop = bytecode.getNextAddress();
        bytecode.addComment(topOfLoop, "top of repeat loop");
        this._generateBytecode(bytecode, node.block, symbolTable);
        this._generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(defs.FJP, 0, topOfLoop, "jump to top of repeat");
        break;
      case Node.FOR:
        // Assign start value.
        var varNode = node.variable;
        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, node.fromExpr, symbolTable);
        bytecode.add(defs.STI, 0, 0, "store into " + varNode.print());

        // Comparison.
        var topOfLoop = bytecode.getNextAddress();
        this._generateBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, node.toExpr, symbolTable);
        bytecode.add(node.downto ? defs.LES : defs.GRT,
          defs.I, 0, "see if we're done with the loop");
        var jumpInstruction = bytecode.getNextAddress();
        bytecode.add(defs.TJP, 0, 0, "yes, jump to end");

        // Body.
        this._generateBytecode(bytecode, node.body, symbolTable);

        // Increment/decrement variable.
        this._generateAddressBytecode(bytecode, varNode, symbolTable);
        this._generateBytecode(bytecode, varNode, symbolTable);
        if (node.downto) {
          bytecode.add(defs.DEC, defs.I, 0, "decrement loop variable");
        } else {
          bytecode.add(defs.INC, defs.I, 0, "increment loop variable");
        }
        bytecode.add(defs.STI, 0, 0, "store into " + varNode.print());

        // Jump back to top.
        bytecode.add(defs.UJP, 0, topOfLoop, "jump to top of loop");

        var endOfLoop = bytecode.getNextAddress();

        // Fix up earlier jump.
        bytecode.setOperand2(jumpInstruction, endOfLoop);
        break;
      case Node.IF:
        var hasElse = node.elseStatement !== null;

        // Do comparison.
        this._generateBytecode(bytecode, node.expression, symbolTable);
        var skipThenInstruction = bytecode.getNextAddress();
        bytecode.add(defs.FJP, 0, 0, "false, jump " + (hasElse ? "to else" : "past body"));

        // Then block.
        this._generateBytecode(bytecode, node.thenStatement, symbolTable);
        var skipElseInstruction = -1;
        if (hasElse) {
          skipElseInstruction = bytecode.getNextAddress();
          bytecode.add(defs.UJP, 0, 0, "jump past else");
        }

        // Else block.
        var falseAddress = bytecode.getNextAddress();
        if (hasElse) {
          this._generateBytecode(bytecode, node.elseStatement, symbolTable);
        }

        // Fix up earlier jumps.
        bytecode.setOperand2(skipThenInstruction, falseAddress);
        if (hasElse !== -1) {
          var endOfIf = bytecode.getNextAddress();
          bytecode.setOperand2(skipElseInstruction, endOfIf);
        }
        break;
      case Node.EXIT:
        // Return from procedure or function. We don't yet have the address
        // of the last instruction in this function, so we keep track of these
        // in an array and deal with them at the end.
        var address = bytecode.getNextAddress();
        bytecode.add(defs.UJP, 0, 0, "return from function/procedure");
        this._addExitInstruction(address);
        break;
      case Node.WHILE:
        // Generate the expression test.
        var topOfLoop = bytecode.getNextAddress();
        bytecode.addComment(topOfLoop, "top of while loop");
        this._generateBytecode(bytecode, node.expression, symbolTable);

        // Jump over the statement if the expression was false.
        var jumpInstruction = bytecode.getNextAddress();
        bytecode.add(defs.FJP, 0, 0, "if false, exit while loop");

        // Generate the statement.
        this._generateBytecode(bytecode, node.statement, symbolTable);
        bytecode.add(defs.UJP, 0, topOfLoop, "jump to top of while loop");

        // Fix up earlier jump.
        var endOfLoop = bytecode.getNextAddress();
        bytecode.setOperand2(jumpInstruction, endOfLoop);
        break;
      case Node.TYPED_CONST:
        // These are just initialized variables. Copy the values to their stack
        // location.
        var constAddress = bytecode.addTypedConstants(node.rawData.data);

        for (var i = 0; i < node.rawData.length; i++) {
          var typeCode = node.rawData.simpleTypeCodes[i];

          bytecode.add(defs.LDA, 0, node.symbol.address + i,
            "address of " + node.name.print() +
              " on stack (element " + i + ")");
          // It's absurd to create this many constants, one for each
          // address in the const pool, but I don't see another
          // straightforward way to do it. Creating an ad-hoc loop is
          // hard because I don't know where I'd store the loop
          // variable. Even if I could store it on the stack where we
          // are, how would I pop it off at the end of the loop? We
          // don't have a POP instruction.
          var cindex = bytecode.addConstant(constAddress + i);
          bytecode.add(defs.LDC, defs.A, cindex, "address of " +
            node.name.print() + " in const area (element " + i + ")");
          bytecode.add(defs.LDI, typeCode, 0, "value of element");
          bytecode.add(defs.STI, typeCode, 0, "write value");
        }

        break;
      case Node.NOT:
        this._generateBytecode(bytecode, node.expression, symbolTable);
        bytecode.add(defs.NOT, 0, 0, "logical not");
        break;
      case Node.NEGATIVE:
        this._generateBytecode(bytecode, node.expression, symbolTable);
        if (node.expression.expressionType.isSimpleType(defs.R)) {
          bytecode.add(defs.NGR, 0, 0, "real sign inversion");
        } else {
          bytecode.add(defs.NGI, 0, 0, "integer sign inversion");
        }
        break;
      case Node.ADDITION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "add", defs.ADI, defs.ADR);
        break;
      case Node.SUBTRACTION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "subtract", defs.SBI, defs.SBR);
        break;
      case Node.MULTIPLICATION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "multiply", defs.MPI, defs.MPR);
        break;
      case Node.DIVISION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "divide", null, defs.DVR);
        break;
      case Node.FIELD_DESIGNATOR:
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(defs.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value of record field");
        break;
      case Node.ARRAY:
        // Array lookup.
        this._generateAddressBytecode(bytecode, node, symbolTable);
        bytecode.add(defs.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value of array element");
        break;
      case Node.ADDRESS_OF:
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);
        break;
      case Node.DEREFERENCE:
        this._generateBytecode(bytecode, node.variable, symbolTable);
        bytecode.add(defs.LDI, node.expressionType.getSimpleTypeCode(), 0,
          "load value pointed to by pointer");
        break;
      case Node.EQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "equals", defs.EQU);
        break;
      case Node.INEQUALITY:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "not equals", defs.NEQ);
        break;
      case Node.LESS_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "less than", defs.LES);
        break;
      case Node.GREATER_THAN:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "greater than", defs.GRT);
        break;
      case Node.LESS_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "less than or equal to", defs.LEQ);
        break;
      case Node.GREATER_THAN_OR_EQUAL_TO:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "greater than or equal to", defs.GEQ);
        break;
      case Node.AND:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "and", defs.AND);
        break;
      case Node.OR:
        this._generateComparisonBinaryBytecode(bytecode, node, symbolTable,
          "or", defs.IOR);
        break;
      case Node.INTEGER_DIVISION:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "divide", defs.DVI, null);
        break;
      case Node.MOD:
        this._generateNumericBinaryBytecode(bytecode, node, symbolTable,
          "mod", defs.MOD, null);
        break;
      default:
        throw new PascalError(null, "can't compile unknown node " + node.nodeType);
    }
  };

  // Generates code to do math on two operands.
  Compiler.prototype._generateNumericBinaryBytecode = function (bytecode, node,
                                                                symbolTable, opName, integerOpcode, realOpcode) {

    this._generateBytecode(bytecode, node.lhs, symbolTable);
    this._generateBytecode(bytecode, node.rhs, symbolTable);
    if (node.expressionType.nodeType === Node.SIMPLE_TYPE) {
      switch (node.expressionType.typeCode) {
        case defs.I:
          if (integerOpcode === null) {
            throw new PascalError(node.token, "can't " + opName + " integers");
          }
          bytecode.add(integerOpcode, 0, 0, opName + " integers");
          break;
        case defs.R:
          if (realOpcode === null) {
            throw new PascalError(node.token, "can't " + opName + " reals");
          }
          bytecode.add(realOpcode, 0, 0, opName + " reals");
          break;
        default:
          throw new PascalError(node.token, "can't " + opName + " operands of type " +
            defs.typeCodeToName(node.expressionType.typeCode));
      }
    } else {
      throw new PascalError(node.token, "can't " + opName +
        " operands of type " + node.expressionType.print());
    }
  };

  // Generates code to compare two operands.
  Compiler.prototype._generateComparisonBinaryBytecode = function (bytecode, node,
                                                                   symbolTable, opName, opcode) {

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

  // Adds the address of the node to the bytecode.
  Compiler.prototype._generateAddressBytecode = function(bytecode, node, symbolTable) {
    switch (node.nodeType) {
      case Node.IDENTIFIER:
        var symbolLookup = node.symbolLookup;

        var i;
        if (symbolLookup.symbol.byReference) {
          // By reference, the address is all we need.
          i = defs.LVA;
        } else {
          // Load its address.
          i = defs.LDA;
        }
        bytecode.add(i, symbolLookup.level,
          symbolLookup.symbol.address, "address of " + node.print());
        break;

      case Node.ARRAY:
        var arrayType = node.variable.expressionType;

        // We compute the strides of the nested arrays as we go.
        var strides = [];

        // Start with the array's element size.
        strides.push(arrayType.elementType.getTypeSize());

        for (var i = 0; i < node.indices.length; i++) {
          // Generate value of index.
          this._generateBytecode(bytecode, node.indices[i], symbolTable);

          // Subtract lower bound.
          var low = arrayType.ranges[i].getRangeLowBound();
          var cindex = bytecode.addConstant(low);
          bytecode.add(defs.LDC, defs.I, cindex, "lower bound " + low);
          bytecode.add(defs.SBI, 0, 0, "subtract lower bound");

          // Add new stride.
          var size = arrayType.ranges[i].getRangeSize();
          strides.push(strides[strides.length - 1]*size);

          // This would be a good place to do a runtime bounds check since
          // we have the index and the size. The top of the stack should be
          // non-negative and less than size.
        }

        // Pop the last stride, we don't need it. It represents the size of the
        // entire array.
        strides.pop();

        // Look up address of array.
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);

        for (var i = 0; i < node.indices.length; i++) {
          // Compute address of the slice or element.
          var stride = strides.pop();
          bytecode.add(defs.IXA, 0, stride,
            "address of array " +
              ((i === node.indices.length - 1) ? "element" : "slice") +
              " (size " + stride + ")");
        }
        break;

      case Node.FIELD_DESIGNATOR:
        var recordType = node.variable.expressionType;

        // Look up address of record.
        this._generateAddressBytecode(bytecode, node.variable, symbolTable);

        // Add the offset of the field.
        var cindex = bytecode.addConstant(node.field.offset);
        bytecode.add(defs.LDC, defs.I, cindex,
          "offset of field \"" + node.field.name.print() + "\"");
        bytecode.add(defs.ADI, 0, 0, "add offset to record address");
        break;

      case Node.DEREFERENCE:
        // Just push the value of the pointer.
        this._generateBytecode(bytecode, node.variable, symbolTable);
        break;

      default:
        throw new PascalError(null, "unknown LHS node " + node.print());
    }
  };

  // Start a frame for a function/procedure.
  Compiler.prototype._beginExitFrame = function () {
    this.exitInstructions.push([]);
  };

  // Add an address of an instruction to update once we know the end of the function.
  Compiler.prototype._addExitInstruction = function (address) {
    this.exitInstructions[this.exitInstructions.length - 1].push(address);
  };

  // End a frame for a function/procedure, returning a list of addresses of UJP functions
  // to update.
  Compiler.prototype._endExitFrame = function () {
    return this.exitInstructions.pop();
  };





  $.ajax('examples/hello.pas', {
    dataType: 'text',
    isLocal: true,
    error: function () {
      console.log('File not found');
    },
    success: function (source) {
      // rename source to contents
      this.source = source;
      var DUMP_TREE = true;
      var DUMP_BYTECODE = true;
      var DEBUG_TRACE = false;

      var stream = new Stream(this.source);
      var lexer = new CommentStripper(new Lexer(stream));
      var parser = new Parser(lexer);

      try {
        // Create the symbol table of built-in constants, functions, and procedures.
        var builtinSymbolTable = SymbolTable.makeBuiltinSymbolTable();

        // Parse the program into a parse tree. Create the symbol table as we go.
        var before = new Date().getTime();
        var root = parser.parse(builtinSymbolTable);
        /// console.log("Parsing: " + (new Date().getTime() - before) + "ms");
        if (DUMP_TREE) {
          var output = root.print("");
          console.log(output);
        }

        // Compile to bytecode.
        before = new Date().getTime();
        var compiler = new Compiler();
        var bytecode = compiler.compile(root);
        /// console.log("Code generation: " + (new Date().getTime() - before) + "ms");
        if (DUMP_BYTECODE) {
          var output = bytecode.print();
          console.log(output);
        }

        // Execute the bytecode.
        var machine = new Machine(bytecode, this.keyboard);
        if (DEBUG_TRACE) {
          machine.setDebugCallback(function (state) {
            console.log(state);
          });
        }
        machine.setFinishCallback(function (runningTime) {
          console.log("Finished program: " + runningTime + "s");
        });
        machine.setOutputCallback(function (line) {
          console.log(line);
        });

        machine.run();
      } catch (e) {
        // Print parsing errors.
        if (e instanceof PascalError) {
          console.log(e.getMessage());
        }
        console.log(e.stack);
      }
    }
  });







  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('Pascal', [], function() {
      return Pascal;
    });
  }
}).call(this);