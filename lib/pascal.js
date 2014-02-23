/**
 * PascalJS
 * @version 0.2
 * @author Sahat Yalkabov
 * @license MIT
 */

var _ = require('underscore');
var fs = require('fs');
var Token = require('./modules/token');
var Scanner = require('./modules/scanner');
var CommentStripper = require('./modules/comment_stripper');
var SymbolTable = require('./modules/symbol_table');
var Compiler = require('./modules/compiler');
var Machine = require('./modules/machine');
var Parser = require('./modules/parser');


var filePath = process.argv[2];
var contents = fs.readFileSync(filePath, 'utf8');
var scanner = new CommentStripper(new Scanner(contents));
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
