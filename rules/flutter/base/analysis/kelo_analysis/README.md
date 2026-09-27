# kelo_analysis

Kelo Flutter analysis options and a verify CLI.

```yaml
# analysis_options.yaml
include: package:kelo_analysis/analysis_options.yaml
```

```sh
dart run kelo_analysis:verify   # CI / pre-commit
```

`verify` fails when the project weakens kelo rules: disabling enabled lints,
lowering `analyzer.errors` severities, turning off `analyzer.language` strict
modes, disabling kelo plugin diagnostics (`al_*`, `lk_*`, `fz_*`), or adding
`// ignore:` comments for kelo rules. Rule changes belong in
[kelo](https://github.com/JosephNK/kelo).
