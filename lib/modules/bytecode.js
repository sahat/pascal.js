var OPCODES = require('./../opcodes');
var utils = require('./../utils');

var Bytecode = function (native) {
  this.istore = [];
  this.constants = [];
  this.typedConstants = [];
  this.startAddress = 0;
  this.comments = {};
  this.native = native;

  this.addConstant = function (c) {
    for (var i = 0; i < this.constants.length; i++) {
      if (c === this.constants[i]) {
        return i;
      }
    }
    this.constants.push(c);
    return this.constants.length - 1;
  };

  this.addTypedConstants = function (raw) {
    var address = this.typedConstants.length;
    this.typedConstants.push.apply(this.typedConstants, raw);
    return address;
  };

  this.add = function (opcode, operand1, operand2, comment) {
    var i = OPCODES.make(opcode, operand1, operand2);
    var address = this.getNextAddress();
    this.istore.push(i);
    if (comment) {
      this.addComment(address, comment);
    }
  };

  this.setOperand2 = function (address, operand2) {
    var i = this.istore[address];
    i = OPCODES.make(OPCODES.getOpcode(i), OPCODES.getOperand1(i), operand2);
    this.istore[address] = i;
  };

  this.getNextAddress = function () {
    return this.istore.length;
  };

  this.setStartAddress = function () {
    this.startAddress = this.getNextAddress();
  };

  this.addComment = function (address, comment) {
    var existingComment = this.comments[address];
    if (existingComment) {
      comment = existingComment + "; " + comment;
    }
    this.comments[address] = comment;
  };
};

module.exports = Bytecode;
