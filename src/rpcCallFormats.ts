export interface TRPCInputBasicFields {
    method: string
    jsonrpc?: string
    id?: string | number
}

export interface TRPCInputBasicFieldsWithParams extends TRPCInputBasicFields {
    params: {
        fromImaAgentIndex?: number
    }
}

export interface TRPCInputBasicFieldsWithArray extends TRPCInputBasicFields {
    params: any[]
}

export interface TRPCOutputBasicFields {
    result?: any
    error?: string
}
