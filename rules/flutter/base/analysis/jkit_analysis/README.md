# jkit_analysis

JKit Flutter analysis options and a verify CLI.

```yaml
# analysis_options.yaml
include: package:jkit_analysis/analysis_options.yaml
```

```sh
dart run jkit_analysis:verify   # CI / pre-commit
```

`verify` fails when the project weakens jkit rules: disabling enabled lints,
lowering `analyzer.errors` severities, turning off `analyzer.language` strict
modes, disabling jkit plugin diagnostics (`al_*`, `lk_*`, `fz_*`), or adding
`// ignore:` comments for jkit rules. Rule changes belong in
[jkit-code-plugin](https://github.com/JosephNK/jkit-code-plugin).
