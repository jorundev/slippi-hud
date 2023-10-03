import type NodeCG from '@nodecg/types';
import { Configschema } from '../../types/schemas/configschema';

let context: NodeCG.ServerAPI;

export function get(): NodeCG.ServerAPI<Configschema> {
    return context;
}

export function set(ctx: NodeCG.ServerAPI) {
    context = ctx;
}
