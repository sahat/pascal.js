var OPCODES = require('./opcodes');
var utils = require('./utils');

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

  this.print = function () {
    return this._printConstants() + "\n" + this._printIstore();
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

  this._printConstants = function () {
    var lines = [];
    for (var i = 0; i < this.constants.length; i++) {
      var value = this.constants[i];
      if (typeof(value) === "string") {
        value = "'" + value + "'";
      }
      lines.push(utils.rightAlign(i, 4) + ": " + value);
    }
    return "Constants:\n" + lines.join("\n") + "\n";
  };

  this._printIstore = function () {
    var lines = [];
    for (var address = 0; address < this.istore.length; address++) {
      var line = utils.rightAlign(address, 4) + ": " +
        utils.leftAlign(OPCODES.disassemble(this.istore[address]), 11);
      var comment = this.comments[address];
      if (comment) {
        line += " ; " + comment;
      }
      lines.push(line);
    }
    return 'Istore:\n' + lines.join("\n") + "\n";
  };
};

module.exports = Bytecode;
