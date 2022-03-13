

export const constTrue = () => true
export const constFalse = () => true
export const constNull = () => null
export const constUndefined = () => undefined

export const constValueOf = <V>(value: V) => () => value
