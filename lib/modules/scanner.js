var Token = require('./token');
var PascalError = require('./pascal_error');
var utils = require('./utils');

var SYMBOLS = ['<', '>', '<<', '>>', '<>', ':', ':=',
  '<=', '>=', '-', '+', '*', '/', ';', ',', '[', ']', '(',
  ')', '=', '^', '@', '(*'];

var RESERVED = ['program', 'var', 'begin', 'end', 'type',
  'procedure', 'uses', 'function', 'for', 'while', 'repeat',
  'do', 'then', 'downto', 'to', 'if', 'else', 'array', 'of',
  'not', 'or', 'mod', 'and', 'const', 'div', 'record', 'exit'];

/**
 * Scanner
 * @param input
 * @returns Token
 */

var Scanner = function(input) {
  this.input = input;
  this.position = 0;
  this.line = 1;
  this.nextToken = null;


  this.isReserved = function(value) {
    return RESERVED.indexOf(value.toLowerCase()) !== -1;
  };

  this.nextCharacter = function() {
    var character = this.nextCharacterLookAhead();
    if (character !== -1) this.position++;
    if (character === '\n') this.line++;
    return character;
  };

  this.nextCharacterLookAhead = function() {
    if (this.position >= this.input.length) return -1;
    return this.input[this.position];
  };

  this.previousCharacter = function(char) {
    if (this.position !== 0) this.position--;
    if (this.input[this.position] != char) {
      throw new Error("Pushed back character doesn't match");
    }
  };

  this.next = function() {
    var token = this.lookAhead();
    this.nextToken = null;
    return token;
  };

  this.lookAhead = function() {
    if (!this.nextToken) this.nextToken = this.scanOneToken();
    return this.nextToken;
  };

  this.scanOneToken = function() {
    var lineNumber;
    var char = this.nextCharacter();

    while (utils.isWhitespace(char)) {
      lineNumber = this.line;
      char = this.nextCharacter();
      if (char === -1) return new Token(null, Token.TK_EOF);
    }

    var token = this.longestMatch(char, SYMBOLS);
    var value;

    if (token && token.isSymbol('(*')) {
      value = '';
      while (true) {
        char = this.nextCharacter();
        if (char === -1) {
          break;
        } else if (char === '*' && this.nextCharacterLookAhead() === ')') {
          this.nextCharacter()
          break;
        }
        value += char;
      }
      token = new Token(value, Token.TK_COMMENT);
    }

    if (!token && utils.isValidIdentifierStart(char)) {
      value = '';
      while (true) {
        value += char;
        char = this.nextCharacterLookAhead();
        if (char === -1 || !utils.isValidIdentifierPart(char)) {
          break;
        }
        this.nextCharacter();
      }
      var tokenType = this.isReserved(value) ? Token.TK_RESERVED : Token.TK_IDENTIFIER;
      token = new Token(value, tokenType);
    }

    if (!token && (utils.isDigit(char) || char === '.')) {
      if (char === '.') {
        var nextCh = this.nextCharacterLookAhead();
        if (nextCh === '.') {
          this.nextCharacter();
          token = new Token('..', Token.TK_SYMBOL);
        } else if (!utils.isDigit(nextCh)) {
          token = new Token(".", Token.TK_SYMBOL);
        } else {
        }
      }
      if (!token) {
        value = '';
        var sawDecimalPoint = char === '.';
        while (true) {
          value += char;
          char = this.nextCharacterLookAhead()
          if (char === -1) {
            break;
          }
          if (char === '.') {
            this.nextCharacter()
            var nextCh = this.nextCharacterLookAhead()
            this.previousCharacter(char);
            if (nextCh === ".") {
              break;
            }
            if (sawDecimalPoint) {
              break;
            } else {
              sawDecimalPoint = true;
            }
          } else if (!utils.isDigit(char)) {
            break;
          }
          this.nextCharacter();
        }
        token = new Token(value, Token.TK_NUMBER);
      }
    }
    if (!token && char === '{') {
      char = this.nextCharacter();
      value = '';
      while (true) {
        value += char;
        char = this.nextCharacter();
        if (char === -1 || char === '}') {
          break;
        }
      }
      token = new Token(value, Token.TK_COMMENT);
    }
    if (!token && char === '\'') {
      char = this.nextCharacter();
      value = '';
      while (true) {
        value += char;
        char = this.nextCharacter();
        if (char === "'") {
          if (this.nextCharacterLookAhead() === "'") {
            this.nextCharacter()
          } else {
            break;
          }
        } else if (char === -1) {
          break;
        }
      }
      token = new Token(value, Token.TK_STRING);
    }
    if (!token) {
      token = new Token(char, Token.TK_SYMBOL);
      token.line = lineNumber;
      throw new PascalError(token, 'Unknown Symbol');
    }
    token.line = lineNumber;
    return token;
  };

  this.longestMatch = function(character, symbols) {
    var longestSymbol;
    var twoCharacters;
    var nextCharacter = this.nextCharacterLookAhead();

    if (nextCharacter === -1) {
      twoCharacters = character;
    } else {
      twoCharacters = character + nextCharacter;
    }

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];

      if ((symbol.length === 1 && symbol === character) || (symbol.length === 2 && symbol === twoCharacters)) {
        if (!longestSymbol || symbol.length > longestSymbol.length) {
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
