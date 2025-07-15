import * as Select from '@radix-ui/react-select';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';

export function ThemeSelector() {
  const { currentTheme, themes, changeTheme, getCurrentTheme } = useTheme();

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--text-muted)' }}
      >
        Theme:
      </span>

      <Select.Root value={currentTheme} onValueChange={changeTheme}>
        <Select.Trigger
          className="inline-flex items-center justify-center rounded px-3 py-2 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border"
              style={{
                backgroundColor: getCurrentTheme()?.preview,
                borderColor: 'var(--border-primary)',
              }}
            />
            <Select.Value />
          </div>
          <Select.Icon className="ml-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75605 9.60753 8.75605 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75605 5.10753 8.75605 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="overflow-hidden rounded-lg border shadow-lg z-50 min-w-80"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <Select.Viewport className="p-2">
              {themes.map((theme) => (
                <Select.Item
                  key={theme.id}
                  value={theme.id}
                  className="relative flex items-center px-3 py-3 text-sm rounded cursor-pointer select-none hover:outline-none focus:outline-none transition-colors"
                  style={{
                    color: 'var(--text-primary)',
                    backgroundColor:
                      currentTheme === theme.id
                        ? 'var(--accent-primary)'
                        : 'transparent',
                  }}
                >
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 w-full"
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 flex-shrink-0"
                      style={{
                        backgroundColor: theme.preview,
                        borderColor: 'var(--text-primary)',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-semibold truncate"
                        style={{
                          color:
                            currentTheme === theme.id
                              ? 'var(--text-button)'
                              : 'var(--text-primary)',
                        }}
                      >
                        <Select.ItemText>{theme.name}</Select.ItemText>
                      </div>
                      <div
                        className="text-xs truncate mt-1"
                        style={{
                          color:
                            currentTheme === theme.id
                              ? 'var(--text-button)'
                              : 'var(--text-muted)',
                          opacity: 0.9,
                        }}
                      >
                        {theme.description}
                      </div>
                    </div>
                  </motion.div>

                  <Select.ItemIndicator className="absolute right-3 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 15 15"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
