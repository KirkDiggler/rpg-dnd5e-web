# The StrictMode Double-Call Saga: A Journey into React's Development Mode

**Date**: 2025-08-04  
**Author**: Kirk & Claude  
**Topic**: Understanding React StrictMode, API calls, and the AbortController rabbit hole

## The Beginning: Console Errors

We started with a simple observation: "we have double load and double submit everything" in our rpg-dnd5e-web project. The immediate suspect was React's StrictMode, which we confirmed was wrapping our app.

## Chapter 1: The AbortController "Solution"

Our first instinct was to "fix" the double calls by adding AbortController to all our API hooks:

```typescript
useEffect(() => {
  const controller = new AbortController();

  fetchCharacter(controller.signal);

  return () => controller.abort();
}, [fetchCharacter]);
```

This seemed like the standard pattern everyone recommends. We even added abort reasons to be helpful:

```typescript
return () => controller.abort('Component unmounted');
```

## Chapter 2: The Error Messages Multiply

But then we started seeing console errors:

- `Error: dnd5e.api.v1alpha1.CharacterService.ListRaces (48ms) Component unmounted`
- `AbortError: signal is aborted without reason`

We tried different approaches:

1. Added abort reasons (made it worse - they showed up as error messages)
2. Removed abort reasons (still got errors)
3. Checked for ConnectError vs AbortError (Connect RPC uses different error types)
4. Added both error checks (errors still appeared)

## Chapter 3: The Revelation

After much debugging, we realized something fundamental:

**StrictMode only affects development mode!**

- In development: Components mount → unmount → mount again (intentionally!)
- In production: Components mount once, no double calls

We were "fixing" a problem that doesn't exist in production!

## Chapter 4: Understanding the Real Issue

The console errors weren't from our code - they were from Connect RPC's internal logging. When we abort a request (even a completed one), the library logs it as an error.

Our "fix" was actually:

1. Starting a request on first mount
2. Immediately aborting it (even if complete) when StrictMode unmounts
3. Starting another request on second mount
4. Creating console noise for no benefit

## Chapter 5: The Deeper Learning

React's StrictMode is trying to teach us something important:

**Your effects should be safe to run multiple times.**

This prepares our code for:

- Fast Refresh during development
- React's concurrent features
- Network retries and error recovery
- Real-world scenarios like user refreshes

## The Lessons Learned

### 1. StrictMode is Your Friend

- It only runs in development
- It helps catch bugs before production
- Double-mounting is intentional, not a bug

### 2. Not Every "Best Practice" Applies Everywhere

- AbortController is great for long-running requests
- For fast API calls, it might create more problems than it solves
- Context matters!

### 3. Understand Your Libraries

- Connect RPC logs aborted requests as errors
- Different libraries handle cancellation differently
- Read the docs for your specific tools

### 4. Question Your Assumptions

- We assumed double calls were bad
- We assumed AbortController was the solution
- We assumed console errors needed fixing
- All these assumptions were wrong!

### 5. Make Your Code Idempotent

Instead of trying to prevent double calls, make your code handle them gracefully:

- GET requests are naturally idempotent
- For mutations, check if the operation already happened
- Design APIs that can handle duplicate requests

## The End Result

We went down a rabbit hole trying to "fix" StrictMode's behavior, when the real lesson was to embrace it. StrictMode is showing us how our app behaves in challenging conditions, and that's valuable.

The journey taught us more than any straightforward implementation would have:

- How React's development mode works
- Why StrictMode exists
- How different libraries handle errors
- The importance of idempotent operations

Sometimes the best fix is no fix at all.

## What We're Doing Now

1. Removing unnecessary AbortController usage for simple API calls
2. Accepting that development mode has double calls
3. Ensuring our API operations are idempotent
4. Focusing on real problems instead of development-only quirks

## Final Thoughts

This rabbit hole was worth it. We learned that sometimes the error messages are trying to tell us we're solving the wrong problem. Instead of silencing the messenger, we should listen to what it's really saying.

In this case, it was saying: "Your code will be called multiple times. Make sure it can handle that."

Message received, React. Message received.
