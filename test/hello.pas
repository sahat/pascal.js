program helloworld;

{ Print hello world }

var sum, counter: integer;
var number1, number2, result : integer;
Var counter : integer;

Begin
    writeln('Hello world!');

    number1 := 10;
    number2 := 20;
    result := number1 + number2;
    writeln(number1, ' plus ', number2, ' is ', result )

    number1 := 2;
    number2 := 2;

    writeln('Two times two is ', number1 * number2);

    number1 := 9;
    number2 := 3;

    writeln('9 divided by 3 is  ', number1 div number2);

    if (number1 < 10) then
       writeln('Number1 is less than 10')
    else
       writeln('Number1 is greater than 10');

    for counter := 1 to 7 do
      writeln('Counter - ', counter);
End
