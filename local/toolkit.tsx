import React from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const identity = await fetch('/api/local/identity').then(r => r.json());
const queryClient = new QueryClient();
export const axiosForBackend = axios.create({ baseURL: '/' });
export const logger = console;
export const ROLE_SUBJECT = 'Role';
export const useCurrentUserProfile = () => identity;
export const useAuth = () => ({ isLoading: false, ability: { can: (role: string) => identity.role === role } });
export const CanRole = ({ roles, children }: any) => roles.includes(identity.role) ? children : null;
export const AppContainer = ({ children }: any) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
export const ErrorRender = ({ error }: any) => <pre>{error.message}</pre>;
export const NotFoundRender = () => <div>页面不存在</div>;
export const getEnv = () => ({});
export const getAssetsUrl = (value: any) => typeof value === 'string' ? value : value?.image?.large || '';
const users = () => fetch('/api/local/users').then(r => r.json());
export class UserService {
  async listUsersByIds(ids: string[]) { return { data: { userInfoMap: Object.fromEntries((await users()).filter((u: any) => ids.includes(u.user_id)).map((u: any) => [u.user_id, u])) } }; }
  async searchUsers(params: any) { return { data: { userList: (await users()).filter((u: any) => u.name.includes(params.query || params.keyword || '')).map((u: any) => ({ ...u, name: { zh_cn: u.name }, avatar: { image: { large: u.avatar } } })), hasMore: false } }; }
  async convertExternalContact() { throw new Error('本地副本只使用已复制的成员'); }
}
export class UserProfileService { async getUserProfile(id: string) { const u = (await users()).find((u: any) => u.user_id === id); return { useLarkCard: false, userProfileInfo: { ...u, userStatus: 2 } }; } }
export class DepartmentService { async searchDepartments() { return { departments: [], hasMore: false }; } }
export class ChatService { async searchChats() { return { chats: [], hasMore: false }; } }
