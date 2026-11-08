## Freezed

- Entity: `@freezed abstract class User with _$User { const factory User({...}) = _User; }`
- BLoC Event/State: `@freezed sealed class` + named constructors (예: `const factory ProductState.loading() = ProductLoading;`)
