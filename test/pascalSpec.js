var should = require('chai').should();
var _ = require('underscore');
var fs = require('fs');
var Token = require('../lib/modules/token');
var Scanner = require('../lib/modules/scanner');
var CommentStripper = require('../lib/modules/uncomment');
var SymbolTable = require('../lib/modules/symbol_table');
var Compiler = require('../lib/modules/compiler');
var Machine = require('../lib/modules/machine');
var Parser = require('../lib/modules/parser');

describe('Pascal Compiler', function() {

  var fileData = fs.readFileSync('./test/hello.pas', 'utf8');
  var scanner = new CommentStripper(new Scanner(fileData));
  var parser = new Parser(scanner);
  var builtinSymbolTable = SymbolTable.makeBuiltinSymbolTable();
  var root = parser.parse(builtinSymbolTable);
  var compiler = new Compiler();
  var bytecode = compiler.compile(root);
  var machine = new Machine(bytecode);

  it('should start the pascal example', function() {
    machine.setOutputCallback(function(line) {
      line.should.equal('Hello world!');
    });
    machine.start();
  });

});