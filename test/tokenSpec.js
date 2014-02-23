var expect = require('chai').expect;
var Token = require('../lib/modules/token.js');

describe('Token', function() {
  it('should create a new string token', function() {
    var token = new Token('Hello', Token.TK_STRING);
    expect(token.tokenType).to.equal(4);
  });
  it('should create a new identifier token', function() {
    var token = new Token('Writeln', Token.TK_IDENTIFIER);
    expect(token.tokenType).to.equal(0);
  });
  it('should create a new reserved token', function() {
    var token = new Token('begin', Token.TK_RESERVED);
    expect(token.tokenType).to.equal(6);
  });
  it('should create a new EOF token', function() {
    var token = new Token(null, Token.TK_EOF);
    expect(token.tokenType).to.equal(5);
  });
  it('should create a new comment token', function() {
    var token = new Token('(* comment *)', Token.TK_COMMENT);
    expect(token.tokenType).to.equal(3);
  });
  it('should create a new number token', function() {
    var token = new Token(42, Token.TK_NUMBER);
    expect(token.tokenType).to.equal(1);
  });
  it('should create a new symbol token', function() {
    var token = new Token('.', Token.TK_SYMBOL);
    expect(token.tokenType).to.equal(2);
  });
});