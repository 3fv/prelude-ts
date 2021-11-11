export function Bind(): MethodDecorator {
  return function <T>(
    target: Object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const fn = descriptor.value

    return {
      configurable: true,
      get() {
        return (fn as any).bind(this)
      }
    } as TypedPropertyDescriptor<T>
  }
}
