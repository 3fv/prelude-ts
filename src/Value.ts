import { WithEquality } from "./Comparison";

import * as util from 'util';
import { ToString } from "./ToString"

/**
 * @hidden
 */
// @ts-ignore -- see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/30241
export const inspect: unique symbol = util.inspect.custom;

export interface Value extends ToString {

    /**
     * Two objects are equal if they represent the same value,
     * regardless of whether they are the same object physically
     * in memory.
     */
    equals(other: any&WithEquality /*TODO*/): boolean; // I experimented with 'this' for the other type but had issues with interfaces

    /**
     * Get a number for that object. Two different values
     * may get the same number, but one value must always get
     * the same number. The formula can impact performance.
     */
    hashCode(): number;

    

    /**
     * Used by the node REPL to display values.
     * Most of the time should be the same as toString()
     */
    [inspect](): string;
}
