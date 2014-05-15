var opcodes = require('./opcodes');

var Bytecode = function(native) {
  this.istore = [];
  this.constants = [];
  this.typedConstants = [];
  this.startAddress = 0;
  this.comments = {};
  this.native = native;

  this.addConstant = function(c) {
    for (var i = 0; i < this.constants.length; i++) {
      if (c === this.constants[i]) {
        return i;
      }
    }
    this.constants.push(c);
    return this.constants.length - 1;
  };

  this.add = function(opcode, operand1, operand2, comment) {
    var i = opcodes.make(opcode, operand1, operand2);
    var address = this.getNextAddress();
    this.istore.push(i);
    if (comment) {
      this.addComment(address, comment);
    }
  };

  this.setOperand2 = function(address, operand2) {
    var i = this.istore[address];
    i = opcodes.make(opcodes.getOpcode(i), opcodes.getOp1(i), operand2);
    this.istore[address] = i;
  };

  this.getNextAddress = function() {
    return this.istore.length;
  };

  this.setStartAddress = function() {
    this.startAddress = this.getNextAddress();
  };

  this.addComment = function(address, comment) {
    var existingComment = this.comments[address];
    if (existingComment) {
      comment = existingComment + "; " + comment;
    }
    this.comments[address] = comment;
  };
};

module.exports = Bytecode;
