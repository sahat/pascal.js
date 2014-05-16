var fs = require('fs');
var Token = require('./modules/token');
var Scanner = require('./modules/scanner');
var Uncomment = require('./modules/uncomment');
var SymbolTable = require('./modules/symbol_table');
var Compiler = require('./modules/compiler');
var StackMachine = require('./modules/stack_machine');
var Parser = require('./modules/parser');


var filePath = process.argv[2];

try {
  var contents = fs.readFileSync(filePath, 'utf8');
} catch (e) {
  console.log('You must specify a Pascal file that needs to be compiled!');
  process.exit(1);
}

var scanner = new Uncomment(new Scanner(contents));
var parser = new Parser(scanner);
var symbolTable = SymbolTable.makeBuiltinSymbolTable();
var tree = parser.parse(symbolTable);
var compiler = new Compiler();
var bytecode = compiler.compile(tree);
var stackMachine = new StackMachine(bytecode);

stackMachine.start();
