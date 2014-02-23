var Token = require('./token');

function CommentStripper(scanner) {
  this.scanner = scanner;

  this.next = function () {
    while (true) {
      var token = this.scanner.next();
      if (token.tokenType != Token.TK_COMMENT) {
        return token;
      }
    }
  };

  this.lookAhead = function () {
    while (true) {
      var token = this.scanner.lookAhead();
      if (token.tokenType != Token.TK_COMMENT) {
        return token;
      } else {
        this.scanner.next();
      }
    }
  };
}

module.exports = CommentStripper;
