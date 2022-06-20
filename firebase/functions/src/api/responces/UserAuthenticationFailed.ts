type UserAuthenticationFailed = {
  exception: string;
}

/**
 * @return {UserAuthenticationFailed} A new instance of UserAuthenticationFailed
 * @param exception
 */
export function toUserAuthenticationFailed(exception: string): UserAuthenticationFailed {
  return {
    exception: exception
  }
}