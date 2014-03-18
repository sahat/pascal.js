program Loop;
var sum, counter: integer;
begin
writeln ('Enter largest number to be summed: ');
sum := 0;                       { initialize (clear) the sum }
counter := 1;                   { initialize the counter }
while counter <= 20 do          { count through 20 }
  begin
  sum := sum + counter;         { add the current number to the sum }
  counter := counter + 1;       { increment the counter }
  end;
writeln ('Sum is ', sum);       { print the result }
end.