var _ = require('underscore');
var opcodes = require('./opcodes');
var Native = require('./native');
var NativeProcedure = require('./native_procedure');
var Node = require('./node');
var Symbol = require('./symbol');

var SymbolTable = function(parentSymbolTable) {
  this.types = {};
  this.symbols = {};
  this.parentSymbolTable = parentSymbolTable;
  this.native = parentSymbolTable ? parentSymbolTable.native : new Native();

  this.totalVariableSize = 0;
  this.totalParameterSize = 0;

  this.addSymbol = function(name, nodeType, type, byReference) {
    var address = -1;

    byReference = byReference || false;

    if (nodeType === Node.VAR) {
      address = opcodes.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.CONST) {
    } else if (nodeType === Node.TYPED_CONST) {
      address = opcodes.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.PARAMETER) {
      address = opcodes.MARK_SIZE + this.totalParameterSize;
      this.totalParameterSize += byReference ? 1 : type.getTypeSize();
    }

    var symbol = new Symbol(name, type, address, byReference);
    this.symbols[name.toLowerCase()] = symbol;

    return symbol;
  },

    this.addType = function(name, type) {
      var symbol = new Symbol(name, type, 0, false);
      this.types[name.toLowerCase()] = symbol;

      return symbol;
    },

    this.getSymbol = function(token, nodeType, level) {
      var name = token.tokenValue.toLowerCase();

      level = level || 0;

      if (this.symbols.hasOwnProperty(name)) {
        var symbol = this.symbols[name];

        if (!nodeType || symbol.type.nodeType === nodeType) {
          return {
            symbol: symbol,
            level: level
          };
        }
      }

      if (this.parentSymbolTable !== null) {
        return this.parentSymbolTable.getSymbol(token, nodeType, level + 1);
      }

    },

    this.getType = function(token, level) {
      var name = token.tokenValue.toLowerCase();

      level = level || 0;

      if (this.types.hasOwnProperty(name)) {
        var symbol = this.types[name];
        return {
          symbol: symbol,
          level: level
        };
      }

      if (this.parentSymbolTable !== null) {
        return this.parentSymbolTable.getType(token, level + 1);
      }

    },


    this.addNativeFunction = function(name, returnType, parameterTypes, func) {
      var nativeProcedure = new NativeProcedure(name, returnType, parameterTypes, func);
      var index = this.native.add(nativeProcedure);

      var makeParameter = function(type, index) {
        var name = Node.makeIdentifierNode(String.fromCharCode(97 + index));
        return new Node(Node.PARAMETER, null, {
          name: name,
          type: type
        });
      };

      var type = new Node(Node.SUBPROGRAM_TYPE, null, {
        parameters: _.map(parameterTypes, makeParameter),
        returnType: returnType
      });

      var symbol = this.addSymbol(name, Node.SUBPROGRAM_TYPE, type);

      symbol.address = index;

      symbol.isNative = true;

      return symbol;
    },

    this.addNativeType = function(name, type) {
      this.addType(name, type);
    }
};

SymbolTable.makeBuiltinSymbolTable = function() {
  var symbolTable = new SymbolTable();

  symbolTable.addNativeType('String', Node.stringType);
  symbolTable.addNativeType('Integer', Node.integerType);
  symbolTable.addNativeType('Pointer', Node.pointerType);
  symbolTable.addNativeFunction('WriteLn', Node.voidType, [], function(ctl) {
    var elements = [];
    for (var i = 1; i < arguments.length; i++) {
      elements.push(arguments[i]);
    }
    ctl.writeln(elements.join(''));
  });

  return symbolTable;
};

module.exports = SymbolTable;