var opcodes = require('./opcodes');

var StackMachine = function(bytecode) {
  this.bytecode = bytecode;
  this.dataStore = [];
  this.programCounter = 0;
  this.stackPointer = 0;
  this.markPointer = 0;
  this.state = StackMachine.STOPPED;
  this.outputCallback = function(line) {
    console.log(line);
  };
  this.pendingDelay = 0;

  var that = this;

  this.control = {
    writeln: function(line) {
      if (that.outputCallback !== null) {
        that.outputCallback(line);
      }
    }
  };

  this.start = function() {
    this.resetMachine();

    this.state = StackMachine.RUNNING;

    this.step(100000);
  };

  this.step = function(count) {
    for (var i = 0; i < count && this.state === StackMachine.RUNNING &&
      this.pendingDelay === 0; i++) {
      this.executeInstruction();
    }
  };
  this.push = function(value) {
    this.dataStore[this.stackPointer++] = value;
  };

  this.pop = function() {
    this.stackPointer--;
    var value = this.dataStore[this.stackPointer];
    this.dataStore[this.stackPointer] = undefined;
    return value;
  };

  this.resetMachine = function() {
    for (var i = 0; i < this.bytecode.typedConstants.length; i++) {
      this.dataStore[i] = this.bytecode.typedConstants[i];
    }
    this.programCounter = this.bytecode.startAddress;
    this.stackPointer = this.bytecode.typedConstants.length;
    this.markPointer = 0;
    this.state = StackMachine.STOPPED;
  };

  this.getStaticLink = function(mp) {
    return this.dataStore[mp + 1];
  };

  this.checkDataAddress = function(address) {

  };

  this.stopProgram = function() {
    this.state = StackMachine.STOPPED;
  };

  this.executeInstruction = function() {
    var address;
    var pc = this.programCounter;
    var i = this.bytecode.istore[pc];

    this.programCounter++;

    var opcode = opcodes.getOpcode(i);
    var op1 = opcodes.getOp1(i);
    var op2 = opcodes.getOp2(i);

    switch (opcode) {
      case opcodes.CUP:
        this.markPointer = this.stackPointer - op1 - opcodes.MARK_SIZE;
        this.dataStore[this.markPointer + 4] = this.programCounter;
        this.programCounter = op2;
        break;
      case opcodes.CSP:
        var nativeProcedure = this.bytecode.native.get(op2);
        var parameters = [];
        for (var i = 0; i < op1; i++) {
          parameters.unshift(this.pop());
        }
        parameters.unshift(this.control);
        var returnValue = nativeProcedure.fn.apply(null, parameters);
        if (!nativeProcedure.returnType.isSimpleType(opcodes.P)) {
          this.push(returnValue);
        }
        break;
      case opcodes.ENT:
        address = this.markPointer + op2;
        for (var i = this.stackPointer; i < address; i++) {
          this.dataStore[i] = 0;
        }
        this.stackPointer = address;
        break;
      case opcodes.RTN:
        var oldMp = this.markPointer;
        this.markPointer = this.dataStore[oldMp + 2];
        this.programCounter = this.dataStore[oldMp + 4];
        if (op1 === opcodes.P) {
          this.stackPointer = oldMp;
        } else {
          this.stackPointer = oldMp + 1;
        }
        break;
      case opcodes.EQ:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 === op2);
        break;
      case opcodes.NEQ:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 !== op2);
        break;
      case opcodes.GT:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 > op2);
        break;
      case opcodes.GTE:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 >= op2);
        break;
      case opcodes.LT:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 < op2);
        break;
      case opcodes.LTE:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 <= op2);
        break;
      case opcodes.ADD:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 + op2);
        break;
      case opcodes.SUB:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 - op2);
        break;
      case opcodes.NEG:
        this.push(-this.pop());
        break;
      case opcodes.MUL:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 * op2);
        break;
      case opcodes.DIV:
        op2 = this.pop();
        op1 = this.pop();
        if (op2 === 0) throw Error('Division By Zero');
        this.push(op1 / op2);
        break;
      case opcodes.MOD:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 % op2);
        break;
      case opcodes.INC:
        this.push(this.pop() + 1);
        break;
      case opcodes.DEC:
        this.push(this.pop() - 1);
        break;
      case opcodes.OR:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 || op2);
        break;
      case opcodes.AND:
        op2 = this.pop();
        op1 = this.pop();
        this.push(op1 && op2);
        break;
      case opcodes.NOT:
        this.push(!this.pop());
        break;
      case opcodes.UJP:
        this.programCounter = op2;
        break;
      case opcodes.XJP:
        this.programCounter = this.pop();
        break;
      case opcodes.FJP:
        if (!this.pop()) {
          this.programCounter = op2;
        }
        break;
      case opcodes.TJP:
        if (this.pop()) {
          this.programCounter = op2;
        }
        break;
      case opcodes.STP:
        this.stopProgram();
        break;
      case opcodes.LDA:
        address = this.computeAddress(op1, op2);
        this.push(address);
        break;
      case opcodes.LDC:
        if (op1 === opcodes.I || op1 === opcodes.R ||
          op1 === opcodes.S || op1 === opcodes.A) {
          this.push(this.bytecode.constants[op2]);
        } else if (op1 === opcodes.B) {
          this.push(!!op2);
        } else if (op1 === opcodes.C) {
          this.push(op2);
        }
        break;
      case opcodes.LDI:
        address = this.pop();
        this.checkDataAddress(address);
        this.push(this.dataStore[address]);
        break;
      case opcodes.LVA:
      case opcodes.LVB:
      case opcodes.LVC:
      case opcodes.LVI:
      case opcodes.LVR:
        address = this.computeAddress(op1, op2);
        this.checkDataAddress(address);
        this.push(this.dataStore[address]);
        break;
      case opcodes.STI:
        var value = this.pop();
        address = this.pop();
        this.checkDataAddress(address);
        this.dataStore[address] = value;
        break;
      case opcodes.IXA:
        address = this.pop();
        var index = this.pop();
        address += index * op2;
        this.push(address);
        break;
    }
  };

  this.computeAddress = function(level, offset) {
    var mp = this.markPointer;

    for (var i = 0; i < level; i++) {
      mp = this.getStaticLink(mp);
    }

    return mp + offset;
  };
};

StackMachine.STOPPED = 0;
StackMachine.RUNNING = 1;

module.exports = StackMachine;