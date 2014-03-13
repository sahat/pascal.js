var fs = require('fs');
var should = require('chai').should();
var Scanner = require('../lib/modules/scanner.js');

describe('Scanner', function() {

  var fileData = fs.readFileSync('./test/hello.pas', 'utf8');
  var scanner;

  beforeEach(function() {
    scanner = new Scanner(fileData);
  });

  it('should load the contents of a file', function() {
    scanner.input.should.not.be.a('undefined');
    scanner.input.should.equal(fileData);
  });

  it('should start at position 0 on line 1', function() {
    scanner.position.should.equal(0);
    scanner.line.should.equal(1);
  });

  it('should return "p" on next character lookahead', function() {
    scanner.nextCharacterLookAhead().should.equal('p');
    scanner.position.should.equal(0);
  });

  it('should return "p" for the next character', function() {
    scanner.nextCharacter().should.equal('p');
    scanner.position.should.equal(1);

  });

  it('should return "r" after after another nextCharacter() call', function() {
    scanner.nextCharacter();
    scanner.nextCharacter().should.equal('r');
    scanner.position.should.equal(2);
  });

  it('should return "program" on token lookahead', function() {
    scanner.lookAhead().tokenValue.should.equal('program');
  });

  it('should return "program" for the next token', function() {
    scanner.next().tokenValue.should.equal('program');
  });
//
//
//  it('should return previous character', function() {
//
//  });
//
//  it('should find the longest token', function() {
//
//  });
//
//  it('should find next token', function() {
//
//  });

});