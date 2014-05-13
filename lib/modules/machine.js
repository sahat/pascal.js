var opcodes = require('./opcodes');

var Machine = function(bytecode) {
  this.bytecode = bytecode;
  this.dataStore = [];
  this.programCounter = 0;
  this.stackPointer = 0;
  this.markPointer = 0;
  this.newPointer = 0;
  this.state = Machine.STOPPED;

  this.pendingDelay = 0;

  var that = this;

  this.control = {
    stop: function() {
      that.stopProgram();
    },
    delay: function(ms) {
      that.pendingDelay = ms;
    },
    writeln: function(line) {
      if (that.outputCallback !== null) {
        that.outputCallback(line);
      }
    },
    readDstore: function(address) {
      return that.dataStore[address];
    },
    writeDstore: function(address, value) {
      that.dataStore[address] = value;
    }
  };

  this.run = function() {
    this.resetMachine();

    this.state = Machine.RUNNING;

    this.step(100000);
  };

  this.step = function(count) {
    for (var i = 0; i < count && this.state === Machine.RUNNING &&
      this.pendingDelay === 0; i++) {
      this.executeInstruction();
    }
  };

  this.setOutputCallback = function(outputCallback) {
    this.outputCallback = outputCallback;
  };

  this.push = function(value) {
    this.dataStore[this.stackPointer++] = value;
  };

  this.pop = function() {
    this.stackPointer--;
    var value = this.dataStore[this.stackPointer];

    // Set it to undefined so we can find bugs more easily.
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
    this.newPointer = this.dataStore.length;
    this.state = Machine.STOPPED;
  };

  this.getStaticLink = function(mp) {
    return this.dataStore[mp + 1];
  };

  this.checkDataAddress = function(address) {

  };

  this.stopProgram = function() {
    this.state = Machine.STOPPED;
  };

  this.executeInstruction = function() {
    // Get this instruction.
    var pc = this.programCounter;
    var i = this.bytecode.istore[pc];

    // Advance the PC right away. Various instructions can then modify it.
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

        // Push result if we're a function.
        if (!nativeProcedure.returnType.isSimpleType(opcodes.P)) {
          this.push(returnValue);
        }
        break;
      case opcodes.ENT:
        // Entry. Set SP or EP to MP + op2, which is the sum of
        // the mark size, the parameters, and all local variables. If
        // we're setting SP, then we're making room for local variables
        // and preparing the SP to do computation.
        var address = this.markPointer + op2;
        // Clear the local variable area.
        for (var i = this.stackPointer; i < address; i++) {
          this.dataStore[i] = 0;
        }
        this.stackPointer = address;

        break;
      case opcodes.MST:
        // Follow static links "op1" times.
        var sl = this.markPointer;
        for (var i = 0; i < op1; i++) {
          sl = this.getStaticLink(sl);
        }

        // Mark Stack.
        this.push(0);              // RV, set by called function.
        this.push(sl);             // SL
        this.push(this.markPointer);        // DL
        this.push(0);              // RA, set by CUP.
        break;
      case opcodes.RTN:
        // Return.
        var oldMp = this.markPointer;
        this.markPointer = this.dataStore[oldMp + 2];
        this.programCounter = this.dataStore[oldMp + 4];
        if (op1 === opcodes.P) {
          // Procedure, pop off the return value.
          this.stackPointer = oldMp;
        } else {
          // Function, leave the return value on the stack.
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
        var address = this.computeAddress(op1, op2);
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
        var address = this.pop();
        this.checkDataAddress(address);
        this.push(this.dataStore[address]);
        break;
      case opcodes.LVA:
      case opcodes.LVB:
      case opcodes.LVC:
      case opcodes.LVI:
      case opcodes.LVR:
        var address = this.computeAddress(op1, op2);
        this.checkDataAddress(address);
        this.push(this.dataStore[address]);
        break;
      case opcodes.STI:
        var value = this.pop();
        var address = this.pop();
        this.checkDataAddress(address);
        this.dataStore[address] = value;
        break;
      case opcodes.IXA:
        var address = this.pop();
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

Machine.STOPPED = 0;
Machine.RUNNING = 1;

module.exports = Machine;