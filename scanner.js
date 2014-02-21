var Token = require('./token');
var utils = require('./utils');

var SYMBOLS = ['<', '<>', '<<', ':', ':=', '>', '>>', '<=', '>=', '-', '+', '*',
  '/', ';', ',', '[', ']', '(', ')', '=', '^', '@', '(*'];

/**
 * Scanner
 * @param stream
 * @returns {Token} Token
 */

var Scanner = function(input) {
  this.input = input;
  this.nextToken = null;
  this.position = 0;
  this.line = 1;

  this.next = function() {
    var token = this.lookAhead();
    this.nextToken = null;
    return token;
  };

  this.previousCharacter = function(char) {
    if (this.position === 0) {
      throw new Error("Can't push back at start of stream");
    }
    this.position--;
    if (this.input[this.position] != char) {
      throw new Error("Pushed back character doesn't match");
    }
  };

  this.nextCharacter = function() {
    var char = this.lookAheadCharacter();
    if (char === '\n') this.line++;
    if (char !== -1) this.position++;
    return char;
  };

  this.lookAheadCharacter = function() {
    if (this.position >= this.input.length) {
      return -1;
    }
    return this.input[this.position];
  };

  this.lookAhead = function () {
    if (!this.nextToken) this.nextToken = this.scanOneToken();
    return this.nextToken;
  };

  this.scanOneToken = function () {
    var lineNumber;
    var ch = this.nextCharacter();

    while (utils.isWhitespace(ch)) {
      lineNumber = this.line;
      ch = this.nextCharacter();
      if (ch === -1) {
        return new Token(null, Token.TK_EOF);
      }
    }

    var token = this.maximalMunch(ch, SYMBOLS);

    if (token !== null && token.isSymbol("(*")) {
      var value = "";
      while (true) {
        ch = this.nextCharacter();
        if (ch === -1) {
          break;
        } else if (ch === "*" && this.lookAheadCharacter() === ")") {
          this.nextCharacter()
          break;
        }
        value += ch;
      }
      token = new Token(value, Token.TK_COMMENT);
    }

    if (token === null && utils.isValidIdentifierStart(ch)) {
      var value = "";
      while (true) {
        value += ch;
        ch = this.lookAheadCharacter();
        if (ch === -1 || !utils.isValidIdentifierPart(ch)) {
          break;
        }
        this.nextCharacter();
      }
      var tokenType = utils.isReserved(value) ? Token.TK_RESERVED : Token.TK_IDENTIFIER;
      token = new Token(value, tokenType);
    }

    if (token === null && (utils.isDigit(ch) || ch === ".")) {
      if (ch === ".") {
        var nextCh = this.lookAheadCharacter();
        if (nextCh === ".") {
          this.nextCharacter();
          token = new Token("..", Token.TK_SYMBOL);
        } else if (!utils.isDigit(nextCh)) {
          token = new Token(".", Token.TK_SYMBOL);
        } else {
        }
      }
      if (token === null) {
        var value = "";
        var sawDecimalPoint = ch === ".";
        while (true) {
          value += ch;
          ch = this.lookAheadCharacter()
          if (ch === -1) {
            break;
          }
          if (ch === ".") {
            this.nextCharacter()
            var nextCh = this.lookAheadCharacter()
            this.previousCharacter(ch);
            if (nextCh === ".") {
              break;
            }
            if (sawDecimalPoint) {
              break;
            } else {
              sawDecimalPoint = true;
            }
          } else if (!utils.isDigit(ch)) {
            break;
          }
          this.nextCharacter();
        }
        token = new Token(value, Token.TK_NUMBER);
      }
    }
    if (token === null && ch === "{") {
      ch = this.nextCharacter();
      var value = "";
      while (true) {
        value += ch;
        ch = this.nextCharacter();
        if (ch === -1 || ch === "}") {
          break;
        }
      }
      token = new Token(value, Token.TK_COMMENT);
    }
    if (token === null && ch === "'") {
      ch = this.nextCharacter();
      var value = "";
      while (true) {
        value += ch;
        ch = this.nextCharacter();
        if (ch === "'") {
          if (this.lookAheadCharacter() === "'") {
            this.nextCharacter()
          } else {
            break;
          }
        } else if (ch === -1) {
          break;
        }
      }
      token = new Token(value, Token.TK_STRING);
    }
    if (token === null) {
      token = new Token(ch, Token.TK_SYMBOL);
      token.line = lineNumber;
      throw new PascalError(token, "unknown symbol");
    }
    token.line = lineNumber;
    return token;
  };

  this.maximalMunch = function (ch, symbols) {
    var longestSymbol = null;
    var nextCh = this.lookAheadCharacter();
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

    if (!longestSymbol) {
      return null;
    }

    if (longestSymbol.length === 2) {
      this.nextCharacter();
    }

    return new Token(longestSymbol, Token.TK_SYMBOL);
  };
};

module.exports = Scanner;
