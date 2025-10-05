import { vi } from "vitest";

export function drizzle() {}
export function postgres() {}
export function auth() {
    return [{
        user: {
            id: 1,
            name: 'mock',
            email: 'mockuser@mock.com'
        }
    }];
}