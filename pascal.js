/**
 * PascalJS
 * @version 0.1
 * @author Sahat Yalkabov
 * @license MIT
 */

var _ = require('underscore');
var fs = require('fs');
var Token = require('./token');
var Scanner = require('./scanner');
var CommentStripper = require('./comment_stripper');
var SymbolTable = require('./symbol_table');
var Compiler = require('./compiler');
var Machine = require('./machine');
var Parser = require('./parser');


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
