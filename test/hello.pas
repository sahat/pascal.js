program helloworld;

{ Print hello world }

var number1, number2, result : integer;

type my_list_of_names = array[0..7] of string;

var the_list: my_list_of_names;

begin

    the_list[0] := 'Newbie';

    writeln('Hello world!');
    writeln('Name 5: ', the_list[0]);

    number1 := 10;
    number2 := 20;
    result := number1 + number2;
    writeln(number1, ' plus ', number2, ' is ', result )

end.
