import LottieView, { type AnimationObject } from 'lottie-react-native';
import { View } from 'react-native';

export function LottieAnimation({
  source,
  size = 110,
  loop = true,
  autoPlay = true,
}: {
  source: AnimationObject | { uri: string };
  size?: number;
  loop?: boolean;
  autoPlay?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <LottieView
        source={source}
        autoPlay={autoPlay}
        loop={loop}
        style={{ width: size, height: size }}
      />
    </View>
  );
}