var Stream = function(input) {
  this.input = input;
  this.position = 0;
  this.line = 1;

  this.lookAhead = function () {
    if (this.position >= this.input.length) {
      return -1;
    }
    return this.input[this.position];
  };

  this.next = function () {
    var char = this.lookAhead();
    if (char === '\n') this.line++;
    if (char !== -1) this.position++;
    return char;
  };

  this.previous = function (char) {
    if (this.position === 0) {
      throw new Error("Can't push back at start of stream");
    }
    this.position--;
    if (this.input[this.position] != char) {
      throw new Error("Pushed back character doesn't match");
    }
  };
};

module.exports = Stream;
