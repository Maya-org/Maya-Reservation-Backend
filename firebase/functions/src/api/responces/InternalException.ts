type InternalException = {
    exception: string;
    display_string?: string;
}

function toInternalException(exception: string, display_string?: string): InternalException {
    return {
        exception,
        display_string
    }
}