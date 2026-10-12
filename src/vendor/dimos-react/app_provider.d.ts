import { ComponentProps, ReactNode } from 'react';
import { DimThemeProviderProps } from './theme/provider.tsx';
import { DataSource } from './data.ts';
import { UrlStateProviderProps } from './url_state.tsx';
import { ToastProvider } from './components/feedback.tsx';
export interface AppProviderProps {
    /** DimThemeProvider props (skin, corners, themeUrl…) */
    theme?: Omit<DimThemeProviderProps, "children">;
    /** a data source (memorySource(), …; default: the page's zenoh-gateway connection) */
    source?: DataSource;
    /** UrlStateProvider props, or false for none */
    url?: Omit<UrlStateProviderProps, "children"> | false;
    /** where toasts appear (ToastProvider's `position`) */
    toastPosition?: ComponentProps<typeof ToastProvider>["position"];
    children?: ReactNode;
}
/**
 * `theme`: DimThemeProvider props (skin, corners, themeUrl…); `source`: a data source (memorySource(), …; default:
 * the page's zenoh-gateway connection); `url`: UrlStateProvider props, or false for none
 */
export declare function AppProvider({ theme, source, url, toastPosition, children }: AppProviderProps): import('react').JSX.Element;
