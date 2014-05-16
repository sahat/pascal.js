var Token = require('./token');
var utils = require('./utils');

var SYMBOLS = ['<', '>', '<<', '>>', '<>', ':', ':=',
  '<=', '>=', '-', '+', '*', '/', ';', ',', '[', ']', '(',
  ')', '=', '^', '@', '(*'];

var KEYWORDS = ['program', 'var', 'begin', 'end', 'type',
  'procedure', 'uses', 'function', 'for', 'while', 'repeat',
  'do', 'then', 'downto', 'to', 'if', 'else', 'array', 'of',
  'not', 'or', 'mod', 'and', 'const', 'div', 'record', 'exit'];

var Scanner = function(input) {
  this.input = input;
  this.position = 0;
  this.line = 1;
  this.nextToken = null;

  this.isReserved = function(value) {
    return KEYWORDS.indexOf(value.toLowerCase()) !== -1;
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
    var value;
    var lineNumber;
    var character = this.nextCharacter();

    while (utils.isWhitespace(character)) {
      lineNumber = this.line;
      character = this.nextCharacter();
      if (character === -1) return new Token(null, Token.TK_EOF);
    }

    var token = this.longestMatch(character, SYMBOLS);

    /**
     * Comment Token
     */
    if (token && token.isSymbol('(*')) {
      value = '';
      while (true) {
        character = this.nextCharacter();
        if (character === -1) {
          break;
        } else if (character === '*' && this.nextCharacterLookAhead() === ')') {
          this.nextCharacter();
          break;
        }
        value += character;
      }
      token = new Token(value, Token.TK_COMMENT);
    }

    /**
     * Reserved Token
     */
    if (utils.isValidIdentifierStart(character) && !token) {
      value = '';
      while (true) {
        value += character;
        character = this.nextCharacterLookAhead();
        if (character === -1 || !utils.isValidIdentifierPart(character)) {
          break;
        }
        this.nextCharacter();
      }
      var tokenType = this.isReserved(value) ? Token.TK_RESERVED : Token.TK_IDENTIFIER;
      token = new Token(value, tokenType);
    }

    /**
     * Number Token
     */
    if (!token && (utils.isDigit(character) || character === '.')) {
      var nextCharacter;
      if (character === '.') {
        nextCharacter = this.nextCharacterLookAhead();
        if (nextCharacter === '.') {
          this.nextCharacter();
          token = new Token('..', Token.TK_SYMBOL);
        } else if (!utils.isDigit(nextCharacter)) {
          token = new Token('.', Token.TK_SYMBOL);
        }
      }
      if (!token) {
        value = '';
        var sawDecimalPoint = character === '.';
        while (true) {
          value += character;
          character = this.nextCharacterLookAhead();
          if (character === -1) break;
          if (character === '.') {
            this.nextCharacter();
            nextCharacter = this.nextCharacterLookAhead();
            this.previousCharacter(character);
            if (nextCharacter === '.') break;
            if (sawDecimalPoint) break; else sawDecimalPoint = true;
          } else if (!utils.isDigit(character)) break;
          this.nextCharacter();
        }
        token = new Token(value, Token.TK_NUMBER);
      }
    }

    /**
     * Comment Token
     */
    if (!token && character === '{') {
      character = this.nextCharacter();
      value = '';
      while (true) {
        value += character;
        character = this.nextCharacter();
        if (character === -1 || character === '}') break;
      }
      token = new Token(value, Token.TK_COMMENT);
    }

    /**
     * String Token
     */
    if (!token && character === "'") {
      character = this.nextCharacter();
      value = '';
      while (true) {
        value += character;
        character = this.nextCharacter();
        if (character === "'") {
          if (this.nextCharacterLookAhead() === "'") {
            this.nextCharacter()
          } else break;
        } else if (character === -1) {
          break;
        }
      }
      token = new Token(value, Token.TK_STRING);
    }

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
