def foo(x):
    print(x)
    return lambda y: x(x(y))

print(foo(foo)(lambda x:x+1)(2))