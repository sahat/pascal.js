program helloworld;

{ Print hello world }
var sum, counter: integer;
var number1, number2, result : integer;

type my_list_of_names = array[0..7] of string;

var the_list: my_list_of_names;

Var counter : integer;

begin

    the_list[0] := 'Newbie';
    the_list[1] := 'Second name';

    writeln('Hello world!');
    writeln('Name 0: ', the_list[0]);
    writeln('Name 1: ', the_list[1]);

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

    for counter := 1 to 7 do
      writeln('Counter - ', counter);
end.
