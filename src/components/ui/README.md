# D&D 5e Web UI Component System

This directory contains the base UI component system for the D&D 5e web application. These components provide consistent styling, theming, and behavior across the entire application.

## Design Principles

- **Consistency**: All components use the same theme variables and follow consistent patterns
- **Composability**: Components are designed to work well together and be easily combined
- **Accessibility**: Built-in ARIA attributes, keyboard navigation, and screen reader support
- **Performance**: Optimized animations and minimal re-renders
- **Protobuf Integration**: Components work seamlessly with protobuf-generated types

## Theme Integration

All components use CSS variables from the theme system:

```css
var(--text-primary)      /* Primary text color */
var(--text-muted)        /* Secondary text color */
var(--bg-primary)        /* Primary background */
var(--card-bg)           /* Card backgrounds */
var(--border-primary)    /* Border colors */
var(--accent-primary)    /* Primary accent color */
var(--shadow-card)       /* Card shadows */
```

## Component Categories

### Core Components

- **Button** - Various button styles with loading states and icons
- **Card** - Content containers with headers, footers, and game rarity styling
- **Modal** - Accessible modal dialogs with portal rendering

### Layout Components

- **Container** - Consistent max-width and centering
- **Grid** - Responsive grid system
- **Panel** - Sectioned content areas

### Form Components

- **Select** - Custom select component with search and multi-select

### Feedback Components

- **LoadingSpinner** - Loading states for async operations
- **ErrorBoundary** - Error handling and recovery
- **EmptyState** - Empty state messaging

## Usage Guidelines

### When to Use Each Component

#### Buttons

```tsx
// Primary actions
<Button variant="primary">Save Character</Button>

// Secondary actions
<Button variant="secondary">Cancel</Button>

// Dangerous actions
<Button variant="danger">Delete Character</Button>

// With icons and loading
<Button
  variant="primary"
  icon={<Save size={16} />}
  loading={isSaving}
>
  Save
</Button>
```

#### Cards

```tsx
// Basic content card
<Card>
  <p>Basic content</p>
</Card>

// Interactive card with rarity
<Card
  interactive
  rarity="legendary"
  onClick={handleClick}
>
  <CardHeader title="Excalibur" />
  <p>A legendary sword...</p>
</Card>

// Card with actions
<Card
  header={<CardHeader title="Equipment" />}
  footer={
    <CardFooter
      primaryAction={{ label: "Equip", onClick: handleEquip }}
      secondaryAction={{ label: "Details", onClick: showDetails }}
    />
  }
>
  <p>Sword of Sharpness</p>
</Card>
```

#### Modals

```tsx
// Basic modal
<Modal
  isOpen={isOpen}
  title="Character Creation"
  onClose={onClose}
>
  <p>Modal content</p>
</Modal>

// Modal with footer actions
<Modal
  isOpen={isOpen}
  title="Delete Character"
  onClose={onClose}
  footer={
    <ModalFooter
      primaryText="Delete"
      onPrimary={handleDelete}
      primaryLoading={isDeleting}
      cancelText="Cancel"
      onCancel={onClose}
    />
  }
>
  <p>Are you sure?</p>
</Modal>
```

#### Layout

```tsx
// Page container
<Container size="xl">
  <h1>Page Title</h1>
  <p>Page content</p>
</Container>

// Grid layout
<Grid cols={3} gap="md">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</Grid>

// Panels for sections
<Panel>
  <PanelHeader
    title="Character Stats"
    icon={<User size={20} />}
  />
  <p>Panel content</p>
</Panel>
```

#### Forms

```tsx
// Basic select
<Select
  options={classOptions}
  value={selectedClass}
  onChange={setSelectedClass}
  placeholder="Choose your class..."
/>

// Searchable multi-select
<Select
  options={skillOptions}
  values={selectedSkills}
  onMultipleChange={setSelectedSkills}
  multiple
  searchable
  label="Choose Skills"
/>
```

#### Feedback

```tsx
// Loading states
<LoadingSpinner size="lg" variant="dice" />

// Empty states
<EmptyState
  title="No Characters"
  description="Create your first character to get started"
  action={{ label: "Create Character", onClick: onCreate }}
/>

// Error handling
<ErrorBoundary>
  <ComponentThatMightFail />
</ErrorBoundary>
```

### Composition Patterns

#### Modal with Complex Form

```tsx
<Modal
  isOpen={isOpen}
  title="Equipment Selection"
  onClose={onClose}
  size="xl"
  loading={isLoading}
  footer={
    <ModalFooter
      primaryText="Confirm"
      onPrimary={handleConfirm}
      onCancel={onClose}
    />
  }
>
  <Container size="full" padding="none">
    <Panel>
      <PanelHeader title="Available Equipment" />
      <CardGrid columns={3}>
        {equipment.map((item) => (
          <Card
            key={item.id}
            interactive
            selected={selected.includes(item.id)}
            onClick={() => toggleSelection(item.id)}
          >
            <CardHeader title={item.name} />
            <p>{item.description}</p>
          </Card>
        ))}
      </CardGrid>
    </Panel>
  </Container>
</Modal>
```

#### Responsive Dashboard Layout

```tsx
<Container size="xl">
  <Grid cols={4} gap="lg" responsive={{ sm: 1, md: 2, lg: 4 }}>
    <GridItem span="full">
      <Panel>
        <PanelHeader title="Character Overview" />
        <CharacterSummary />
      </Panel>
    </GridItem>

    <GridItem span={2}>
      <StatsCard title="Ability Scores" stats={abilityStats} />
    </GridItem>

    <GridItem span={2}>
      <Panel>
        <PanelHeader title="Equipment" />
        <EquipmentGrid />
      </Panel>
    </GridItem>
  </Grid>
</Container>
```

## Animation and Motion

Components use Framer Motion for smooth animations:

- **Card hover effects** - Scale and elevation on hover
- **Modal transitions** - Smooth enter/exit animations
- **Loading spinners** - Various animated loading states
- **Button interactions** - Scale feedback on press

Animation can be disabled by setting `noAnimation={true}` or `animate={false}` where supported.

## Accessibility Features

- **Keyboard navigation** - Tab order and arrow key support
- **Screen reader support** - Proper ARIA labels and roles
- **Focus management** - Focus trapping in modals
- **Color contrast** - Theme colors meet WCAG guidelines
- **Semantic HTML** - Proper heading hierarchy and landmarks

## Performance Considerations

- **Lazy loading** - Large component trees use React.lazy()
- **Memoization** - Expensive computations are memoized
- **Portal rendering** - Modals render to document.body
- **Optimized animations** - Hardware accelerated transforms
- **Bundle splitting** - Components are tree-shakeable

## Extending Components

To create new components that integrate with the system:

1. **Use theme variables** for colors and spacing
2. **Follow naming conventions** (PascalCase for components, camelCase for props)
3. **Include TypeScript types** with JSDoc comments
4. **Support common props** (className, children, disabled, etc.)
5. **Add accessibility attributes** where appropriate
6. **Test with different themes** to ensure compatibility

Example new component:

```tsx
interface MyComponentProps {
  /** Component title */
  title: string;
  /** Whether component is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function MyComponent({
  title,
  disabled = false,
  className,
}: MyComponentProps) {
  return (
    <div
      className={cn('my-component', disabled && 'opacity-50', className)}
      style={{
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-primary)',
      }}
    >
      <h3>{title}</h3>
    </div>
  );
}
```

## Migration Guide

When converting existing components to use the new system:

1. **Replace manual portals** with `<Modal>` component
2. **Convert inline styles** to theme variables
3. **Use composition** instead of large monolithic components
4. **Add loading and error states** using feedback components
5. **Improve accessibility** with proper ARIA attributes

This component system provides a solid foundation for building consistent, accessible, and performant UI across the D&D 5e web application.
