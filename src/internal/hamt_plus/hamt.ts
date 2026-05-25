/**
 *  @fileOverview Hash Array Mapped Trie.
 *
 *  Code based on: https://github.com/exclipy/pdata
 */

/* Configuration
 ******************************************************************************/
const SIZE = 5

const BUCKET_SIZE = Math.pow(2, SIZE)

const MASK = BUCKET_SIZE - 1

const MAX_INDEX_NODE = BUCKET_SIZE / 2

const MIN_ARRAY_NODE = BUCKET_SIZE / 4

/* Types
 ******************************************************************************/
type KeyEqFn = (a: any, b: any) => boolean
type HashFn = (key: any) => number
type UpdateFn = (current?: any) => any
type SizeRef = { value: number }

interface HamtConfig {
  keyEq: KeyEqFn
  hash: HashFn
}

interface VisitState {
  value: any
  rest: any
}

/*
 ******************************************************************************/
const nothing: any = {}

const constant =
  <T>(x: T) =>
  (): T =>
    x

/**
 *  Get 32 bit hash of string.
 *
 *  Based on:
 *  http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
 */
export const hash: HashFn = (str: any): number => {
  const type = typeof str
  if (type === "number") return str as number
  if (type !== "string") str += ""

  let h = 0
  for (let i = 0, len = str.length; i < len; ++i) {
    const c = str.charCodeAt(i)
    h = (((h << 5) - h) + c) | 0
  }
  return h
}

/* Bit Ops
 ******************************************************************************/
/**
 *  Hamming weight.
 *
 *  Taken from: http://jsperf.com/hamming-weight
 */
const popcount = (x: number): number => {
  x -= (x >> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
  x = (x + (x >> 4)) & 0x0f0f0f0f
  x += x >> 8
  x += x >> 16
  return x & 0x7f
}

const hashFragment = (shift: number, h: number): number =>
  (h >>> shift) & MASK

const toBitmap = (x: number): number => 1 << x

const fromBitmap = (bitmap: number, bit: number): number =>
  popcount(bitmap & (bit - 1))

/* Array Ops
 ******************************************************************************/
/**
 *  Set a value in an array.
 *
 *  @param mutate Should the input array be mutated?
 *  @param at Index to change.
 *  @param v New value
 *  @param arr Array.
 */
const arrayUpdate = <T>(mutate: boolean, at: number, v: T, arr: T[]): T[] => {
  let out = arr
  if (!mutate) {
    const len = arr.length
    out = new Array(len)
    for (let i = 0; i < len; ++i) out[i] = arr[i]
  }
  out[at] = v
  return out
}

/**
 *  Remove a value from an array.
 *
 *  @param mutate Should the input array be mutated?
 *  @param at Index to remove.
 *  @param arr Array.
 */
const arraySpliceOut = <T>(mutate: boolean, at: number, arr: T[]): T[] => {
  const newLen = arr.length - 1
  let i = 0
  let g = 0
  let out = arr
  if (mutate) {
    i = g = at
  } else {
    out = new Array(newLen)
    while (i < at) out[g++] = arr[i++]
  }
  ++i
  while (i <= newLen) out[g++] = arr[i++]
  if (mutate) {
    out.length = newLen
  }
  return out
}

/**
 *  Insert a value into an array.
 *
 *  @param mutate Should the input array be mutated?
 *  @param at Index to insert at.
 *  @param v Value to insert.
 *  @param arr Array.
 */
const arraySpliceIn = <T>(
  mutate: boolean,
  at: number,
  v: T,
  arr: T[]
): T[] => {
  const len = arr.length
  if (mutate) {
    let i = len
    while (i >= at) arr[i--] = arr[i]
    arr[at] = v
    return arr
  }
  let i = 0,
    g = 0
  const out: T[] = new Array(len + 1)
  while (i < at) out[g++] = arr[i++]
  out[at] = v
  while (i < len) out[++g] = arr[i++]
  return out
}

/* Node Structures
 ******************************************************************************/
const LEAF = 1
const COLLISION = 2
const INDEX = 3
const ARRAY = 4

/**
 *  Empty node.
 */
const empty: any = {
  __hamt_isEmpty: true
}

const isEmptyNode = (x: any): boolean =>
  x === empty || (x && x.__hamt_isEmpty)

/**
 *  Leaf holding a value.
 *
 *  @member edit Edit of the node.
 *  @member hash Hash of key.
 *  @member key Key.
 *  @member value Value stored.
 */
const Leaf = (edit: number, hash: number, key: any, value: any): any => ({
  type: LEAF,
  edit: edit,
  hash: hash,
  key: key,
  value: value,
  _modify: Leaf__modify
})

/**
 *  Leaf holding multiple values with the same hash but different keys.
 *
 *  @member edit Edit of the node.
 *  @member hash Hash of key.
 *  @member children Array of collision children node.
 */
const Collision = (edit: number, hash: number, children: any[]): any => ({
  type: COLLISION,
  edit: edit,
  hash: hash,
  children: children,
  _modify: Collision__modify
})

/**
 *  Internal node with a sparse set of children.
 *
 *  Uses a bitmap and array to pack children.
 *
 *  @member edit Edit of the node.
 *  @member mask Bitmap that encode the positions of children in the array.
 *  @member children Array of child nodes.
 */
const IndexedNode = (edit: number, mask: number, children: any[]): any => ({
  type: INDEX,
  edit: edit,
  mask: mask,
  children: children,
  _modify: IndexedNode__modify
})

/**
 *  Internal node with many children.
 *
 *  @member edit Edit of the node.
 *  @member size Number of children.
 *  @member children Array of child nodes.
 */
const ArrayNode = (edit: number, size: number, children: any[]): any => ({
  type: ARRAY,
  edit: edit,
  size: size,
  children: children,
  _modify: ArrayNode__modify
})

/**
 *  Is `node` a leaf node?
 */
const isLeaf = (node: any): boolean =>
  node === empty || node.type === LEAF || node.type === COLLISION

/* Internal node operations.
 ******************************************************************************/
/**
 *  Expand an indexed node into an array node.
 *
 *  @param edit Current edit.
 *  @param frag Index of added child.
 *  @param child Added child.
 *  @param bitmap Index node mask before child added.
 *  @param subNodes Index node children before child added.
 */
const expand = (
  edit: number,
  frag: number,
  child: any,
  bitmap: number,
  subNodes: any[]
): any => {
  const arr: any[] = []
  let bit = bitmap
  let count = 0
  for (let i = 0; bit; ++i) {
    if (bit & 1) arr[i] = subNodes[count++]
    bit >>>= 1
  }
  arr[frag] = child
  return ArrayNode(edit, count + 1, arr)
}

/**
 *  Collapse an array node into a indexed node.
 *
 *  @param edit Current edit.
 *  @param count Number of elements in new array.
 *  @param removed Index of removed element.
 *  @param elements Array node children before remove.
 */
const pack = (
  edit: number,
  count: number,
  removed: number,
  elements: any[]
): any => {
  const children: any[] = new Array(count - 1)
  let g = 0
  let bitmap = 0
  for (let i = 0, len = elements.length; i < len; ++i) {
    if (i !== removed) {
      const elem = elements[i]
      if (elem && !isEmptyNode(elem)) {
        children[g++] = elem
        bitmap |= 1 << i
      }
    }
  }
  return IndexedNode(edit, bitmap, children)
}

/**
 *  Merge two leaf nodes.
 *
 *  @param shift Current shift.
 *  @param h1 Node 1 hash.
 *  @param n1 Node 1.
 *  @param h2 Node 2 hash.
 *  @param n2 Node 2.
 */
const mergeLeaves = (
  edit: number,
  shift: number,
  h1: number,
  n1: any,
  h2: number,
  n2: any
): any => {
  if (h1 === h2) return Collision(edit, h1, [n2, n1])

  const subH1 = hashFragment(shift, h1)
  const subH2 = hashFragment(shift, h2)
  return IndexedNode(
    edit,
    toBitmap(subH1) | toBitmap(subH2),
    subH1 === subH2
      ? [mergeLeaves(edit, shift + SIZE, h1, n1, h2, n2)]
      : subH1 < subH2
        ? [n1, n2]
        : [n2, n1]
  )
}

/**
 *  Update an entry in a collision list.
 *
 *  @param mutate Should mutation be used?
 *  @param edit Current edit.
 *  @param keyEq Key compare function.
 *  @param h Hash of collision.
 *  @param list Collision list.
 *  @param f Update function.
 *  @param k Key to update.
 *  @param size Size ref.
 */
const updateCollisionList = (
  mutate: boolean,
  edit: number,
  keyEq: KeyEqFn,
  h: number,
  list: any[],
  f: UpdateFn,
  k: any,
  size: SizeRef
): any[] => {
  const len = list.length
  for (let i = 0; i < len; ++i) {
    const child = list[i]
    if (keyEq(k, child.key)) {
      const value = child.value
      const newValue = f(value)
      if (newValue === value) return list

      if (newValue === nothing) {
        --size.value
        return arraySpliceOut(mutate, i, list)
      }
      return arrayUpdate(mutate, i, Leaf(edit, h, k, newValue), list)
    }
  }

  const newValue = f()
  if (newValue === nothing) return list
  ++size.value
  return arrayUpdate(mutate, len, Leaf(edit, h, k, newValue), list)
}

const canEditNode = (edit: number, node: any): boolean => edit === node.edit

/* Editing
 ******************************************************************************/
function Leaf__modify(
  this: any,
  edit: number,
  keyEq: KeyEqFn,
  shift: number,
  f: UpdateFn,
  h: number,
  k: any,
  size: SizeRef
): any {
  if (keyEq(k, this.key)) {
    const v = f(this.value)
    if (v === this.value) return this
    else if (v === nothing) {
      --size.value
      return empty
    }
    if (canEditNode(edit, this)) {
      this.value = v
      return this
    }
    return Leaf(edit, h, k, v)
  }
  const v = f()
  if (v === nothing) return this
  ++size.value
  return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v))
}

function Collision__modify(
  this: any,
  edit: number,
  keyEq: KeyEqFn,
  shift: number,
  f: UpdateFn,
  h: number,
  k: any,
  size: SizeRef
): any {
  if (h === this.hash) {
    const canEdit = canEditNode(edit, this)
    const list = updateCollisionList(
      canEdit,
      edit,
      keyEq,
      this.hash,
      this.children,
      f,
      k,
      size
    )
    if (list === this.children) return this

    return list.length > 1
      ? Collision(edit, this.hash, list)
      : list[0] // collapse single element collision list
  }
  const v = f()
  if (v === nothing) return this
  ++size.value
  return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v))
}

function IndexedNode__modify(
  this: any,
  edit: number,
  keyEq: KeyEqFn,
  shift: number,
  f: UpdateFn,
  h: number,
  k: any,
  size: SizeRef
): any {
  const mask = this.mask
  const children = this.children
  const frag = hashFragment(shift, h)
  const bit = toBitmap(frag)
  const indx = fromBitmap(mask, bit)
  const exists = mask & bit
  const current = exists ? children[indx] : empty
  const child = current._modify(edit, keyEq, shift + SIZE, f, h, k, size)

  if (current === child) return this

  const canEdit = canEditNode(edit, this)
  let bitmap = mask
  let newChildren: any[]
  if (exists && isEmptyNode(child)) {
    // remove
    bitmap &= ~bit
    if (!bitmap) return empty
    if (children.length <= 2 && isLeaf(children[indx ^ 1]))
      return children[indx ^ 1] // collapse

    newChildren = arraySpliceOut(canEdit, indx, children)
  } else if (!exists && !isEmptyNode(child)) {
    // add
    if (children.length >= MAX_INDEX_NODE)
      return expand(edit, frag, child, mask, children)

    bitmap |= bit
    newChildren = arraySpliceIn(canEdit, indx, child, children)
  } else {
    // modify
    newChildren = arrayUpdate(canEdit, indx, child, children)
  }

  if (canEdit) {
    this.mask = bitmap
    this.children = newChildren
    return this
  }
  return IndexedNode(edit, bitmap, newChildren)
}

function ArrayNode__modify(
  this: any,
  edit: number,
  keyEq: KeyEqFn,
  shift: number,
  f: UpdateFn,
  h: number,
  k: any,
  size: SizeRef
): any {
  let count = this.size
  const children = this.children
  const frag = hashFragment(shift, h)
  const child = children[frag]
  const newChild = (child || empty)._modify(
    edit,
    keyEq,
    shift + SIZE,
    f,
    h,
    k,
    size
  )

  if (child === newChild) return this

  const canEdit = canEditNode(edit, this)
  let newChildren: any[]
  if (isEmptyNode(child) && !isEmptyNode(newChild)) {
    // add
    ++count
    newChildren = arrayUpdate(canEdit, frag, newChild, children)
  } else if (!isEmptyNode(child) && isEmptyNode(newChild)) {
    // remove
    --count
    if (count <= MIN_ARRAY_NODE) return pack(edit, count, frag, children)
    newChildren = arrayUpdate(canEdit, frag, empty, children)
  } else {
    // modify
    newChildren = arrayUpdate(canEdit, frag, newChild, children)
  }

  if (canEdit) {
    this.size = count
    this.children = newChildren
    return this
  }
  return ArrayNode(edit, count, newChildren)
}

empty._modify = (
  edit: number,
  keyEq: KeyEqFn,
  shift: number,
  f: UpdateFn,
  h: number,
  k: any,
  size: SizeRef
): any => {
  const v = f()
  if (v === nothing) return empty
  ++size.value
  return Leaf(edit, h, k, v)
}

/*
 ******************************************************************************/
export class HamtMap {
  _editable: number
  _edit: number
  _config: HamtConfig
  _root: any
  _size: number

  constructor(
    editable: number,
    edit: number,
    config: HamtConfig,
    root: any,
    size: number
  ) {
    this._editable = editable
    this._edit = edit
    this._config = config
    this._root = root
    this._size = size
  }

  setTree(newRoot: any, newSize: number): HamtMap {
    if (this._editable) {
      this._root = newRoot
      this._size = newSize
      return this
    }
    return newRoot === this._root
      ? this
      : new HamtMap(
          this._editable,
          this._edit,
          this._config,
          newRoot,
          newSize
        )
  }

  tryGetHash(alt: any, hash: number, key: any): any {
    return tryGetHash(alt, hash, key, this)
  }

  tryGet(alt: any, key: any): any {
    return tryGet(alt, key, this)
  }

  getHash(hash: number, key: any): any {
    return getHash(hash, key, this)
  }

  get(key: any, alt?: any): any {
    return tryGet(alt, key, this)
  }

  hasHash(hash: number, key: any): boolean {
    return hasHash(hash, key, this)
  }

  has(key: any): boolean {
    return has(key, this)
  }

  isEmpty(): boolean {
    return isEmpty(this)
  }

  modifyHash(hash: number, key: any, f: UpdateFn): HamtMap {
    return modifyHash(f, hash, key, this)
  }

  modify(key: any, f: UpdateFn): HamtMap {
    return modify(f, key, this)
  }

  setHash(hash: number, key: any, value: any): HamtMap {
    return setHash(hash, key, value, this)
  }

  set(key: any, value: any): HamtMap {
    return set(key, value, this)
  }

  removeHash(hash: number, key: any): HamtMap {
    return removeHash(hash, key, this)
  }

  deleteHash(hash: number, key: any): HamtMap {
    return removeHash(hash, key, this)
  }

  remove(key: any): HamtMap {
    return remove(key, this)
  }

  delete(key: any): HamtMap {
    return remove(key, this)
  }

  beginMutation(): HamtMap {
    return beginMutation(this)
  }

  endMutation(): HamtMap {
    return endMutation(this)
  }

  mutate(f: (map: HamtMap) => void): HamtMap {
    return mutate(f, this)
  }

  entries(): MapIterator {
    return entries(this)
  }

  [Symbol.iterator](): MapIterator {
    return entries(this)
  }

  keys(): MapIterator {
    return keys(this)
  }

  values(): MapIterator {
    return values(this)
  }

  fold<Z>(f: (acc: Z, value: any, key: any) => Z, z: Z): Z {
    return fold(f, z, this)
  }

  forEach(f: (value: any, key: any, map: HamtMap) => void): void {
    return forEach(f, this)
  }

  count(): number {
    return count(this)
  }

  get size(): number {
    return this._size
  }
}

/* Queries
 ******************************************************************************/
/**
 *  Lookup the value for `key` in `map` using a custom `hash`.
 *
 *  Returns the value or `alt` if none.
 */
export const tryGetHash = (
  alt: any,
  hash: number,
  key: any,
  map: HamtMap
): any => {
  let node = map._root
  let shift = 0
  const keyEq = map._config.keyEq
  while (true)
    switch (node.type) {
      case LEAF: {
        return keyEq(key, node.key) ? node.value : alt
      }
      case COLLISION: {
        if (hash === node.hash) {
          const children = node.children
          for (let i = 0, len = children.length; i < len; ++i) {
            const child = children[i]
            if (keyEq(key, child.key)) return child.value
          }
        }
        return alt
      }
      case INDEX: {
        const frag = hashFragment(shift, hash)
        const bit = toBitmap(frag)
        if (node.mask & bit) {
          node = node.children[fromBitmap(node.mask, bit)]
          shift += SIZE
          break
        }
        return alt
      }
      case ARRAY: {
        node = node.children[hashFragment(shift, hash)]
        if (node) {
          shift += SIZE
          break
        }
        return alt
      }
      default:
        return alt
    }
}

/**
 *  Lookup the value for `key` in `map` using internal hash function.
 *
 *  @see `tryGetHash`
 */
export const tryGet = (alt: any, key: any, map: HamtMap): any =>
  tryGetHash(alt, map._config.hash(key), key, map)

/**
 *  Lookup the value for `key` in `map` using a custom `hash`.
 *
 *  Returns the value or `undefined` if none.
 */
export const getHash = (hash: number, key: any, map: HamtMap): any =>
  tryGetHash(undefined, hash, key, map)

/**
 *  Lookup the value for `key` in `map` using internal hash function.
 *
 *  @see `get`
 */
export const get = (key: any, map: HamtMap): any =>
  tryGetHash(undefined, map._config.hash(key), key, map)

/**
 *  Does an entry exist for `key` in `map`? Uses custom `hash`.
 */
export const hasHash = (hash: number, key: any, map: HamtMap): boolean =>
  tryGetHash(nothing, hash, key, map) !== nothing

/**
 *  Does an entry exist for `key` in `map`? Uses internal hash function.
 */
export const has = (key: any, map: HamtMap): boolean =>
  hasHash(map._config.hash(key), key, map)

const defKeyCompare: KeyEqFn = (x, y) => x === y

/**
 *  Create an empty map.
 *
 *  @param config Configuration.
 */
export const make = (config?: Partial<HamtConfig>): HamtMap =>
  new HamtMap(
    0,
    0,
    {
      keyEq: (config && config.keyEq) || defKeyCompare,
      hash: (config && config.hash) || hash
    },
    empty,
    0
  )

/**
 *  Empty map.
 */
const emptyMap: HamtMap = make()

/**
 *  Does `map` contain any elements?
 */
export const isEmpty = (map: HamtMap): boolean =>
  !!(map && isEmptyNode(map._root))

/* Updates
 ******************************************************************************/
/**
 *  Alter the value stored for `key` in `map` using function `f` using
 *  custom hash.
 *
 *  `f` is invoked with the current value for `k` if it exists,
 *  or no arguments if no such value exists. `modify` will always either
 *  update or insert a value into the map.
 *
 *  Returns a map with the modified value. Does not alter `map`.
 */
export const modifyHash = (
  f: UpdateFn,
  hash: number,
  key: any,
  map: HamtMap
): HamtMap => {
  const size: SizeRef = { value: map._size }
  const newRoot = map._root._modify(
    map._editable ? map._edit : NaN,
    map._config.keyEq,
    0,
    f,
    hash,
    key,
    size
  )
  return map.setTree(newRoot, size.value)
}

/**
 *  Alter the value stored for `key` in `map` using function `f` using
 *  internal hash function.
 *
 *  @see `modifyHash`
 */
export const modify = (f: UpdateFn, key: any, map: HamtMap): HamtMap =>
  modifyHash(f, map._config.hash(key), key, map)

/**
 *  Store `value` for `key` in `map` using custom `hash`.
 *
 *  Returns a map with the modified value. Does not alter `map`.
 */
export const setHash = (
  hash: number,
  key: any,
  value: any,
  map: HamtMap
): HamtMap => modifyHash(constant(value), hash, key, map)

/**
 *  Store `value` for `key` in `map` using internal hash function.
 *
 *  @see `setHash`
 */
export const set = (key: any, value: any, map: HamtMap): HamtMap =>
  setHash(map._config.hash(key), key, value, map)

/**
 *  Remove the entry for `key` in `map`.
 *
 *  Returns a map with the value removed. Does not alter `map`.
 */
const del = constant(nothing)
export const removeHash = (hash: number, key: any, map: HamtMap): HamtMap =>
  modifyHash(del, hash, key, map)

/**
 *  Remove the entry for `key` in `map` using internal hash function.
 *
 *  @see `removeHash`
 */
export const remove = (key: any, map: HamtMap): HamtMap =>
  removeHash(map._config.hash(key), key, map)

/* Mutation
 ******************************************************************************/
/**
 *  Mark `map` as mutable.
 */
export const beginMutation = (map: HamtMap): HamtMap =>
  new HamtMap(
    map._editable + 1,
    map._edit + 1,
    map._config,
    map._root,
    map._size
  )

/**
 *  Mark `map` as immutable.
 */
export const endMutation = (map: HamtMap): HamtMap => {
  map._editable = map._editable && map._editable - 1
  return map
}

/**
 *  Mutate `map` within the context of `f`.
 *  @param f
 *  @param map HAMT
 */
export const mutate = (f: (map: HamtMap) => void, map: HamtMap): HamtMap => {
  const transient = beginMutation(map)
  f(transient)
  return endMutation(transient)
}

/* Traversal
 ******************************************************************************/
/**
 *  Apply a continuation.
 */
const appk = (k: any): VisitState | undefined =>
  k && lazyVisitChildren(k[0], k[1], k[2], k[3], k[4])

/**
 *  Recursively visit all values stored in an array of nodes lazily.
 */
const lazyVisitChildren = (
  len: number,
  children: any[],
  i: number,
  f: (node: any) => any,
  k: any
): VisitState | undefined => {
  while (i < len) {
    const child = children[i++]
    if (child && !isEmptyNode(child))
      return lazyVisit(child, f, [len, children, i, f, k])
  }
  return appk(k)
}

/**
 *  Recursively visit all values stored in `node` lazily.
 */
const lazyVisit = (
  node: any,
  f: (node: any) => any,
  k?: any
): VisitState | undefined => {
  switch (node.type) {
    case LEAF:
      return {
        value: f(node),
        rest: k
      }

    case COLLISION:
    case ARRAY:
    case INDEX: {
      const children = node.children
      return lazyVisitChildren(children.length, children, 0, f, k)
    }

    default:
      return appk(k)
  }
}

const DONE: any = {
  done: true
}

/**
 *  Javascript iterator over a map.
 */
export class MapIterator {
  v: VisitState | undefined

  constructor(v: VisitState | undefined) {
    this.v = v
  }

  next(): any {
    if (!this.v) return DONE
    const v0 = this.v
    this.v = appk(v0.rest)
    return v0
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 *  Lazily visit each value in map with function `f`.
 */
const visit = (map: HamtMap, f: (node: any) => any): MapIterator =>
  new MapIterator(lazyVisit(map._root, f))

/**
 *  Get a Javascsript iterator of `map`.
 *
 *  Iterates over `[key, value]` arrays.
 */
const buildPairs = (x: any): [any, any] => [x.key, x.value]
export const entries = (map: HamtMap): MapIterator => visit(map, buildPairs)

/**
 *  Get array of all keys in `map`.
 *
 *  Order is not guaranteed.
 */
const buildKeys = (x: any): any => x.key
export const keys = (map: HamtMap): MapIterator => visit(map, buildKeys)

/**
 *  Get array of all values in `map`.
 *
 *  Order is not guaranteed, duplicates are preserved.
 */
const buildValues = (x: any): any => x.value
export const values = (map: HamtMap): MapIterator => visit(map, buildValues)

/* Fold
 ******************************************************************************/
/**
 *  Visit every entry in the map, aggregating data.
 *
 *  Order of nodes is not guaranteed.
 *
 *  @param f Function mapping accumulated value, value, and key to new value.
 *  @param z Starting value.
 *  @param m HAMT
 */
export const fold = <Z>(
  f: (acc: Z, value: any, key: any) => Z,
  z: Z,
  m: HamtMap
): Z => {
  const root = m._root
  if (root.type === LEAF) return f(z, root.value, root.key)

  const toVisit: any[][] = [root.children]
  let children: any[] | undefined
  while ((children = toVisit.pop())) {
    for (let i = 0, len = children.length; i < len; ) {
      const child = children[i++]
      if (child && child.type) {
        if (child.type === LEAF) z = f(z, child.value, child.key)
        else toVisit.push(child.children)
      }
    }
  }
  return z
}

/**
 *  Visit every entry in the map, aggregating data.
 *
 *  Order of nodes is not guaranteed.
 *
 *  @param f Function invoked with value and key
 *  @param map HAMT
 */
export const forEach = (
  f: (value: any, key: any, map: HamtMap) => void,
  map: HamtMap
): void => {
  fold((_acc: null, value, key) => {
    f(value, key, map)
    return null
  }, null, map)
}

/* Aggregate
 ******************************************************************************/
/**
 *  Get the number of entries in `map`.
 */
export const count = (map: HamtMap): number => map._size

/* Export
 ******************************************************************************/
export { emptyMap as empty }

export const hamt = {
  hash,
  tryGetHash,
  tryGet,
  getHash,
  get,
  hasHash,
  has,
  make,
  empty: emptyMap,
  isEmpty,
  modifyHash,
  modify,
  setHash,
  set,
  removeHash,
  remove,
  beginMutation,
  endMutation,
  mutate,
  entries,
  keys,
  values,
  fold,
  forEach,
  count
}

export default hamt
