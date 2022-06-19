type UserAuthenticationFailed = {
    exception: string;
}

function toUserAuthenticationFailed(exception: string): UserAuthenticationFailed {
    return {
        exception: exception
    }
}