import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { AxiosError, Method } from 'axios';

interface ErrorBody {
  message?: string;
  // 后端全局异常过滤器返回的是 { error: { code, message, details, ... } }，
  // 即 error 是对象、不是字符串；这里兼容对象与字符串两种形态，避免把对象
  // 直接喂给 new Error() 导致 message 变成 "[object Object]"。
  error?: string | { message?: string; code?: string };
}

export async function apiRequest<T>(method: Method, url: string, data?: unknown, params?: unknown): Promise<T> {
  try {
    const response = await axiosForBackend({ url, method, data, params });
    return response.data as T;
  } catch (error) {
    const axiosError = error as AxiosError<ErrorBody>;
    const status: number | undefined = axiosError.response?.status;
    if (status === 403) {
      throw new Error('无操作权限，请联系管理员分配角色');
    }
    const body: ErrorBody | undefined = axiosError.response?.data;
    const rawError = body?.error;
    const message: string =
      (rawError && typeof rawError === 'object' && typeof rawError.message === 'string' ? rawError.message : undefined) ??
      (typeof body?.message === 'string' ? body.message : undefined) ??
      (typeof rawError === 'string' ? rawError : undefined) ??
      axiosError.message;
    logger.error(`[api] ${method} ${url} failed: ${message}`);
    throw new Error(message);
  }
}
