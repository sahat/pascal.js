var fs = require('fs');
var should = require('chai').should();
var Scanner = require('../lib/modules/scanner.js');

describe('Scanner', function() {

  var fileData;
  var scanner;

  before(function() {
    fileData = fs.readFileSync('./test/hello.pas', 'utf8');
    scanner = new Scanner(fileData);
  });

  it('should load the contents of a file', function() {
    scanner.input.should.not.be.a('undefined');
    scanner.input.should.equal(fileData);
  });

  it('should start at position 0 on line 1', function() {

  });

  it('should find next character', function() {

  });

  it('should perform character lookahead', function() {

  });

  it('should find next token', function() {

  });

  it('should return previous character', function() {

  });

  it('should find the longest token', function() {

  });

  it('should find next token', function() {

  });

});