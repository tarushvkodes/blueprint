# FTC Java Compile Fixture

This fixture is a deliberately small compatibility surface for Blueprint-generated FTC starter code. It is not a replacement for the FTC SDK; it only provides enough API shape for CI to catch Java syntax errors, missing generated files, package mismatches, annotation mistakes, and obvious use of unsupported FTC classes.

The compile verifier copies these stubs plus generated TeamCode files into `.cache/java-compile` and runs `javac`.
