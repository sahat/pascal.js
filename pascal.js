/**
 * PascalJS
 * @version 0.1
 * @author Sahat Yalkabov
 * @license MIT
 */
var _ = require('underscore');
var fs = require('fs');
var PascalError = require('./pascal_error');
var Token = require('./token');
var Bytecode = require('./bytecode');
var Scanner = require('./scanner');
var Stream = require('./stream');
var Symbol = require('./symbol');
var Node = require('./node');
var CommentStripper = require('./comment_stripper');
var RawData = require('./raw_data');
var OPCODES = require('./opcodes');
var NativeProcedure = require('./native_procedure');
var Native = require('./native');
var SymbolLookup = require('./symbol_lookup')
var SymbolTable = require('./symbol_table');
var Compiler = require('./compiler');
var Machine = require('./machine');
var Parser = require('./parser');



var contents = fs.readFileSync('./examples/hello.pas', 'utf8');

var stream = new Stream(contents);
var scanner = new CommentStripper(new Scanner(stream));
var parser = new Parser(scanner);
var builtinSymbolTable = SymbolTable.makeBuiltinSymbolTable();
var root = parser.parse(builtinSymbolTable);
var compiler = new Compiler();
var bytecode = compiler.compile(root);
var machine = new Machine(bytecode);


machine.setOutputCallback(function (line) {
  console.log(line);
});

machine.run();
